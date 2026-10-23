package com.example.commutemood.application;

import com.example.commutemood.config.AppProperties;
import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;
import com.example.commutemood.domain.RouteSource;
import com.example.commutemood.domain.ScoredRoute;
import com.example.commutemood.repository.RouteQueryRepository;
import com.example.commutemood.repository.memory.MemoryCommuteRecordRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.verifyNoInteractions;

class CommuteServiceTest {

    private static final GeoPoint ORIGIN = new GeoPoint(116.392, 39.905);
    private static final GeoPoint DESTINATION = new GeoPoint(116.405, 39.912);
    private static final ScoredRoute FAST = new ScoredRoute(
            "route-fast", "最快路线 A", 1500, 1080, 40.0, 62.0, 0.72, true, false, List.of());
    private static final ScoredRoute CALM = new ScoredRoute(
            "route-calm", "少心累路线 B", 1700, 1210, 20.0, 43.0, 0.68, false, true, List.of());
    private static final RouteComparison COMPARISON = new RouteComparison(
            List.of(FAST, CALM), "route-fast", "route-calm", "ok", true,
            RouteSource.REAL, com.example.commutemood.domain.FeedbackSource.REAL,
            com.example.commutemood.domain.ScoringStatus.VALID,
            com.example.commutemood.domain.RecommendationReason.RECOMMENDED,
            WeightedStressRouteScoringStrategy.VERSION, "WALKING", null, null);

    private final MemoryCommuteRecordRepository commuteRepository = new MemoryCommuteRecordRepository();
    private final RouteQueryRepository routeQueryRepository = mock(RouteQueryRepository.class);
    private final DeviceIdentityService identityService = new DeviceIdentityService(
            new AppProperties("test-salt", new AppProperties.Amap(""), "http://localhost:5173"));
    private final CommuteService service = new CommuteService(
            commuteRepository, routeQueryRepository, identityService);

    private String deviceHash;

    @BeforeEach
    void setUp() {
        deviceHash = identityService.hash("device-x");
        doCallRealMethod().when(routeQueryRepository).isExpired(any(), any(), any());
    }

    private UUID stubSnapshot(RouteComparison comparison, Instant createdAt) {
        UUID snapshotId = UUID.randomUUID();
        when(routeQueryRepository.findSnapshotById(snapshotId, deviceHash))
                .thenReturn(Optional.of(new RouteQueryHistory(snapshotId, ORIGIN, DESTINATION, comparison, createdAt)));
        return snapshotId;
    }

    @Test
    void rebuildsScoresFromSnapshotSoClientCannotTamper() {
        UUID snapshotId = stubSnapshot(COMPARISON, Instant.now());

        CommuteCompletion completion = service.complete("device-x", snapshotId, "op-1", "route-fast", 25, null);
        CommuteRecord record = completion.record();

        assertThat(completion.outcome()).isEqualTo(CommuteCompletion.Outcome.CREATED);
        // 评分/时长全部来自快照，而非前端提交
        assertThat(record.selectedScore()).isEqualTo(62.0);
        assertThat(record.fastestScore()).isEqualTo(62.0);
        assertThat(record.estimatedSeconds()).isEqualTo(1080);
        assertThat(record.durationMinutes()).isEqualTo(18);
        assertThat(record.routeLabel()).isEqualTo("最快路线 A");
        assertThat(record.confidence()).isEqualTo(0.72);
        assertThat(record.alternativeLabel()).isEqualTo("少心累路线 B");
        assertThat(record.alternativeScore()).isEqualTo(43.0);
        assertThat(record.alternativeDurationRatio()).isCloseTo(1210 / 1080.0, org.assertj.core.data.Offset.offset(1e-9));
        // 用户感受是合法前端输入，原样保留
        assertThat(record.endStressLevel()).isEqualTo(25);
        assertThat(record.snapshotId()).isEqualTo(snapshotId);
        assertThat(record.operationId()).isEqualTo("op-1");
        assertThat(record.routeSource()).isEqualTo(RouteSource.REAL);
    }

    @Test
    void savesSubMinuteRouteWithOneCompatMinute() {
        ScoredRoute quick = new ScoredRoute(
                "route-quick", "很近的路", 100, 45, 10.0, 30.0, 0.5, true, true, List.of());
        RouteComparison comparison = new RouteComparison(
                List.of(quick), "route-quick", "route-quick", "ok", false,
                RouteSource.REAL, com.example.commutemood.domain.FeedbackSource.REAL,
                com.example.commutemood.domain.ScoringStatus.VALID,
                com.example.commutemood.domain.RecommendationReason.NO_ALTERNATIVE,
                WeightedStressRouteScoringStrategy.VERSION, "WALKING", null, null);
        UUID snapshotId = stubSnapshot(comparison, Instant.now());

        CommuteCompletion completion = service.complete("device-x", snapshotId, "op-1", "route-quick", 50, null);

        assertThat(completion.outcome()).isEqualTo(CommuteCompletion.Outcome.CREATED);
        assertThat(completion.record().estimatedSeconds()).isEqualTo(45);
        assertThat(completion.record().durationMinutes()).isEqualTo(1); // 不足一分钟也能保存
    }

    @Test
    void missingSnapshotIsRejected() {
        when(routeQueryRepository.findSnapshotById(any(), any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.complete("device-x", UUID.randomUUID(), "op-1", "route-fast", 25, null))
                .isInstanceOf(SnapshotMissingException.class);
    }

    @Test
    void expiredSnapshotIsRejected() {
        UUID snapshotId = stubSnapshot(COMPARISON, Instant.now().minusSeconds(3600));

        assertThatThrownBy(() -> service.complete("device-x", snapshotId, "op-1", "route-fast", 25, null))
                .isInstanceOf(SnapshotExpiredException.class);
    }

    @Test
    void routeOutsideSnapshotIsRejected() {
        UUID snapshotId = stubSnapshot(COMPARISON, Instant.now());

        assertThatThrownBy(() -> service.complete("device-x", snapshotId, "op-1", "route-invented", 25, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void invalidStressLevelIsRejected() {
        UUID snapshotId = stubSnapshot(COMPARISON, Instant.now());

        assertThatThrownBy(() -> service.complete("device-x", snapshotId, "op-1", "route-fast", 30, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void duplicateSameOperationReturnsSameRecordAndCountsOnce() {
        UUID snapshotId = stubSnapshot(COMPARISON, Instant.now());

        CommuteCompletion first = service.complete("device-x", snapshotId, "op-1", "route-fast", 25, null);
        CommuteCompletion second = service.complete("device-x", snapshotId, "op-1", "route-fast", 25, null);

        assertThat(first.outcome()).isEqualTo(CommuteCompletion.Outcome.CREATED);
        assertThat(second.outcome()).isEqualTo(CommuteCompletion.Outcome.DUPLICATE);
        assertThat(second.record().id()).isEqualTo(first.record().id());
        // 趋势只计一次
        assertThat(commuteRepository.findByDeviceSince(deviceHash, Instant.EPOCH)).hasSize(1);
    }

    @Test
    void sameOperationWithDifferentContentConflictsAndDoesNotWrite() {
        UUID snapshotId = stubSnapshot(COMPARISON, Instant.now());

        CommuteCompletion first = service.complete("device-x", snapshotId, "op-1", "route-fast", 25, null);
        CommuteCompletion conflict = service.complete("device-x", snapshotId, "op-1", "route-calm", 25, null);

        assertThat(first.outcome()).isEqualTo(CommuteCompletion.Outcome.CREATED);
        assertThat(conflict.outcome()).isEqualTo(CommuteCompletion.Outcome.CONFLICT);
        assertThat(commuteRepository.findByDeviceSince(deviceHash, Instant.EPOCH)).hasSize(1);
    }

    @Test
    void differentOperationCreatesSeparateRecords() {
        UUID snapshotId = stubSnapshot(COMPARISON, Instant.now());

        CommuteCompletion first = service.complete("device-x", snapshotId, "op-1", "route-fast", 25, null);
        CommuteCompletion second = service.complete("device-x", snapshotId, "op-2", "route-fast", 25, null);

        assertThat(first.outcome()).isEqualTo(CommuteCompletion.Outcome.CREATED);
        assertThat(second.outcome()).isEqualTo(CommuteCompletion.Outcome.CREATED);
        assertThat(commuteRepository.findByDeviceSince(deviceHash, Instant.EPOCH)).hasSize(2);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void savedOperationReplaysOriginalReceiptEvenWhenSnapshotExpiredOrMissing(boolean missing) {
        UUID snapshotId = stubSnapshot(COMPARISON, Instant.now());
        CommuteCompletion first = service.complete("device-x", snapshotId, "lost-response", "route-fast", 25, null);
        when(routeQueryRepository.findSnapshotById(snapshotId, deviceHash)).thenReturn(missing ? Optional.empty()
                : Optional.of(new RouteQueryHistory(snapshotId, ORIGIN, DESTINATION, COMPARISON,
                        Instant.now().minusSeconds(7200))));
        clearInvocations(routeQueryRepository);

        CommuteCompletion replay = service.complete("device-x", snapshotId, "lost-response", "route-fast", 25, null);

        assertThat(replay.outcome()).isEqualTo(CommuteCompletion.Outcome.DUPLICATE);
        assertThat(replay.record()).isEqualTo(first.record());
        assertThat(commuteRepository.findByDeviceSince(deviceHash, Instant.EPOCH)).hasSize(1);
        verifyNoInteractions(routeQueryRepository);
    }

    @Test
    void savedOperationWithChangedBusinessInputStillConflictsWithoutSnapshot() {
        UUID snapshotId = stubSnapshot(COMPARISON, Instant.now());
        CommuteCompletion first = service.complete("device-x", snapshotId, "existing-op", "route-fast", 25, null);
        when(routeQueryRepository.findSnapshotById(snapshotId, deviceHash)).thenReturn(Optional.empty());
        clearInvocations(routeQueryRepository);

        assertThat(service.complete("device-x", snapshotId, "existing-op", "route-calm", 25, null).outcome())
                .isEqualTo(CommuteCompletion.Outcome.CONFLICT);
        assertThat(service.complete("device-x", snapshotId, "existing-op", "route-fast", 75, null).outcome())
                .isEqualTo(CommuteCompletion.Outcome.CONFLICT);
        var changedSnapshot = service.complete("device-x", UUID.randomUUID(), "existing-op", "route-fast", 25, null);
        assertThat(changedSnapshot.outcome()).isEqualTo(CommuteCompletion.Outcome.CONFLICT);
        assertThat(changedSnapshot.record()).isEqualTo(first.record());
        assertThat(commuteRepository.findByDeviceSince(deviceHash, Instant.EPOCH)).hasSize(1);
        verifyNoInteractions(routeQueryRepository);
    }

    @Test
    void matchingOperationIdOnAnotherDeviceCannotReplayAnOwnersReceipt() {
        UUID snapshotId = stubSnapshot(COMPARISON, Instant.now());
        service.complete("device-x", snapshotId, "shared-op", "route-fast", 25, null);

        assertThatThrownBy(() -> service.complete("other-device", snapshotId, "shared-op", "route-fast", 25, null))
                .isInstanceOf(SnapshotMissingException.class);
        assertThat(commuteRepository.findByDeviceSince(identityService.hash("other-device"), Instant.EPOCH)).isEmpty();
        assertThat(commuteRepository.findByDeviceSince(deviceHash, Instant.EPOCH)).hasSize(1);
    }

    @Test
    void cityWalkingTripCanBeCompletedAtExpectedArrivalAfterThirtyMinutes() {
        UUID snapshotId = stubSnapshot(cityComparison(), Instant.now().minusSeconds(60 * 60));

        var result = service.complete("device-x", snapshotId, "city-trip", "route-long", 50, null);

        assertThat(result.outcome()).isEqualTo(CommuteCompletion.Outcome.CREATED);
        assertThat(result.record().estimatedSeconds()).isEqualTo(60 * 60);
        assertThat(result.record().durationMinutes()).isEqualTo(60);
    }

    @Test
    void cityWalkingTripExpiresAfterItsDurationPlusArrivalGrace() {
        UUID snapshotId = stubSnapshot(cityComparison(), Instant.now().minusSeconds(76 * 60));

        assertThatThrownBy(() -> service.complete("device-x", snapshotId, "city-trip", "route-long", 50, null))
                .isInstanceOf(SnapshotExpiredException.class);
        assertThat(commuteRepository.findByDeviceSince(deviceHash, Instant.EPOCH)).isEmpty();
    }

    @Test
    void unselectedLongRouteCannotExtendTheShortRouteThirtyMinuteWindow() {
        UUID freshId = stubSnapshot(cityComparison(), Instant.now().minusSeconds(29 * 60));
        assertThat(service.complete("device-x", freshId, "short-valid", "route-short", 25, null).outcome())
                .isEqualTo(CommuteCompletion.Outcome.CREATED);

        UUID oldId = stubSnapshot(cityComparison(), Instant.now().minusSeconds(31 * 60));
        assertThatThrownBy(() -> service.complete("device-x", oldId, "short-expired", "route-short", 25, null))
                .isInstanceOf(SnapshotExpiredException.class);
        assertThat(commuteRepository.findByDeviceSince(deviceHash, Instant.EPOCH)).hasSize(1);
    }

    private RouteComparison cityComparison() {
        var shortRoute = new ScoredRoute("route-short", "短途", 800, 600,
                40.0, 30.0, 0.72, true, false, List.of());
        var longRoute = new ScoredRoute("route-long", "跨街区步行", 4800, 3600,
                20.0, 40.0, 0.72, false, true, List.of());
        return new RouteComparison(List.of(shortRoute, longRoute), "route-short", "route-long", "ok", false,
                RouteSource.REAL, com.example.commutemood.domain.FeedbackSource.REAL,
                com.example.commutemood.domain.ScoringStatus.VALID,
                com.example.commutemood.domain.RecommendationReason.DETOUR_TOO_LONG,
                WeightedStressRouteScoringStrategy.VERSION, "WALKING", null, null);
    }
}
