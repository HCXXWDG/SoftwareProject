package com.example.commutemood.application;

import com.example.commutemood.config.AppProperties;
import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.RouteSource;
import com.example.commutemood.repository.CommuteRecordRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * D05：趋势口径（自然日窗口、空日期不补零、预计时长样本、来源筛选、重复写入不重复计数）。
 */
class TrendServiceTest {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final String DEVICE_ID = "demo-browser";

    private final CommuteRecordRepository repository = mock(CommuteRecordRepository.class);
    private final DeviceIdentityService identityService = new DeviceIdentityService(
            new AppProperties("test-salt", new AppProperties.Amap(""), "http://localhost:5173"));
    private final TrendService service = new TrendService(repository, identityService);
    private final String deviceHash = identityService.hash(DEVICE_ID);

    @Test
    void summarizesImprovingTrend() {
        stub(List.of(
                legacyRecord(75, 3),
                legacyRecord(50, 2),
                legacyRecord(25, 1),
                legacyRecord(25, 0)));

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 7, ZONE);

        assertThat(result.totalCommutes()).isEqualTo(4);
        assertThat(result.summary().averageStress()).isEqualTo(43.75);
        assertThat(result.summary().stressDelta()).isEqualTo(-37.5);
        assertThat(result.summary().direction()).isEqualTo("improving");
        assertThat(result.summary().sampleSufficient()).isTrue();
    }

    @Test
    void marksEmptyHistoryAsUnknown() {
        stub(List.of());

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 7, ZONE);

        assertThat(result.totalCommutes()).isZero();
        assertThat(result.summary().averageStress()).isNull();
        assertThat(result.summary().stressDelta()).isNull();
        assertThat(result.summary().direction()).isEqualTo("unknown");
        assertThat(result.summary().sampleSufficient()).isFalse();
        // 空数据也要给出完整的 7 个自然日，且压力为 null（不补零），C 的折线图才能断开
        assertThat(result.points()).hasSize(7);
        assertThat(result.points()).allSatisfy(point -> {
            assertThat(point.averageStress()).isNull();
            assertThat(point.commuteCount()).isZero();
            assertThat(point.averageEstimatedSeconds()).isNull();
            assertThat(point.estimatedSampleCount()).isZero();
        });
    }

    @Test
    void queriesFromStartOfFirstCalendarDayNotRollingWindow() {
        stub(List.of());

        service.getTrends(DEVICE_ID, 7, ZONE);

        ArgumentCaptor<Instant> since = ArgumentCaptor.forClass(Instant.class);
        verify(repository).findByDeviceSince(eq(deviceHash), since.capture());
        assertThat(since.getValue())
                .isEqualTo(LocalDate.now(ZONE).minusDays(6).atStartOfDay(ZONE).toInstant());
    }

    @Test
    void returnsOnePointPerDayInAscendingOrderWithoutGaps() {
        LocalDate today = LocalDate.now(ZONE);
        stub(List.of(
                record("op-1", null, RouteSource.REAL, 60, 1500, atDay(6, 8, 0)),
                record("op-2", null, RouteSource.REAL, 40, 1200, atDay(0, 18, 30))));

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 7, ZONE);

        assertThat(result.points()).hasSize(7);
        assertThat(result.points()).extracting(TrendService.TrendPoint::date)
                .containsExactly(
                        today.minusDays(6), today.minusDays(5), today.minusDays(4),
                        today.minusDays(3), today.minusDays(2), today.minusDays(1), today);
        assertThat(result.points().get(0).commuteCount()).isEqualTo(1);
        assertThat(result.points().get(0).averageStress()).isEqualTo(60.0);
        assertThat(result.points().get(1).averageStress()).isNull();
        assertThat(result.points().get(5).averageStress()).isNull();
        assertThat(result.points().get(6).commuteCount()).isEqualTo(1);
        assertThat(result.totalCommutes())
                .isEqualTo(result.points().stream()
                        .mapToInt(TrendService.TrendPoint::commuteCount)
                        .sum());
    }

    @Test
    void countsRepeatedOperationIdOnlyOnce() {
        String operationId = UUID.randomUUID().toString();
        Instant completedAt = atDay(0, 8, 15);
        stub(List.of(
                record(operationId, null, RouteSource.REAL, 50, 1500, completedAt),
                record(operationId, null, RouteSource.REAL, 50, 1500, completedAt.plusSeconds(45))));

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 7, ZONE);

        assertThat(result.totalCommutes()).isEqualTo(1);
        assertThat(result.deduplicatedCommutes()).isEqualTo(1);
        assertThat(result.points().get(6).commuteCount()).isEqualTo(1);
        assertThat(result.summary().averageStress()).isEqualTo(50.0);
    }

    @Test
    void countsLegacyDoubleWriteOnlyOnce() {
        // 历史记录没有 operationId：同路线、同分钟、同压力视为同一次通勤的重放
        Instant completedAt = atDay(0, 8, 15);
        stub(List.of(
                legacyRecordAt("route-fast", 50, completedAt),
                legacyRecordAt("route-fast", 50, completedAt.plusSeconds(20))));

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 7, ZONE);

        assertThat(result.totalCommutes()).isEqualTo(1);
        assertThat(result.deduplicatedCommutes()).isEqualTo(1);
    }

    @Test
    void keepsGenuinelyDistinctLegacyCommutes() {
        stub(List.of(
                legacyRecordAt("route-fast", 50, atDay(0, 8, 15)),
                legacyRecordAt("route-calm", 25, atDay(0, 18, 40))));

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 7, ZONE);

        assertThat(result.totalCommutes()).isEqualTo(2);
        assertThat(result.deduplicatedCommutes()).isZero();
    }

    @Test
    void excludesDemoSourceFromStatistics() {
        stub(List.of(
                record("op-demo", null, RouteSource.DEMO, 90, 900, atDay(0, 8, 0)),
                record("op-real", null, RouteSource.REAL, 40, 1500, atDay(0, 18, 0))));

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 7, ZONE);

        assertThat(result.totalCommutes()).isEqualTo(1);
        assertThat(result.excludedDemoCommutes()).isEqualTo(1);
        assertThat(result.summary().averageStress()).isEqualTo(40.0);
        assertThat(result.points().get(6).commuteCount()).isEqualTo(1);
    }

    @Test
    void marksUnknownSourceRecordsExplicitly() {
        stub(List.of(
                legacyRecord(50, 1),
                legacyRecord(25, 0)));

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 7, ZONE);

        assertThat(result.totalCommutes()).isEqualTo(2);
        assertThat(result.unknownSourceCommutes()).isEqualTo(2);
        assertThat(result.excludedDemoCommutes()).isZero();
    }

    @Test
    void averagesEstimatedSecondsOnlyOverPresentSamples() {
        stub(List.of(
                record("op-1", null, RouteSource.REAL, 50, 1500, atDay(0, 8, 0)),
                record("op-2", null, RouteSource.REAL, 50, 1200, atDay(0, 18, 0)),
                legacyRecordAt("route-fast", 50, atDay(0, 12, 0))));

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 7, ZONE);
        TrendService.TrendPoint today = result.points().get(6);

        assertThat(today.commuteCount()).isEqualTo(3);
        // 历史记录没有 estimatedSeconds：样本数 2、均值 (1500+1200)/2，不把 null 当 0
        assertThat(today.estimatedSampleCount()).isEqualTo(2);
        assertThat(today.averageEstimatedSeconds()).isEqualTo(1350.0);
    }

    @Test
    void leavesEstimatedSecondsNullWhenOnlyLegacyRecordsExist() {
        stub(List.of(legacyRecord(50, 0)));

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 7, ZONE);

        assertThat(result.points().get(6).averageEstimatedSeconds()).isNull();
        assertThat(result.points().get(6).estimatedSampleCount()).isZero();
        assertThat(result.points().get(6).commuteCount()).isEqualTo(1);
    }

    @Test
    void keepsOutOfWindowRecordsFromBreakingBucketOrder() {
        // completedAt 由前端提交，可能是未来时间；不能塞进任何自然日桶，否则 points 失去升序
        stub(List.of(
                record("op-real", null, RouteSource.REAL, 40, 1500, atDay(0, 8, 0)),
                record("op-future", null, RouteSource.REAL, 90, 1500,
                        Instant.now().plus(3, ChronoUnit.DAYS))));

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 7, ZONE);

        assertThat(result.points()).hasSize(7);
        assertThat(result.totalCommutes()).isEqualTo(1);
        assertThat(result.outOfWindowCommutes()).isEqualTo(1);
    }

    @Test
    void echoesRequestedWindowAndTimezone() {
        stub(List.of());

        TrendService.TrendResult result = service.getTrends(DEVICE_ID, 3, ZONE);

        assertThat(result.days()).isEqualTo(3);
        assertThat(result.timezone()).isEqualTo("Asia/Shanghai");
        assertThat(result.points()).hasSize(3);
    }

    @Test
    void rejectsWindowOutsideOneToThirtyDays() {
        assertThatThrownBy(() -> service.getTrends(DEVICE_ID, 0, ZONE))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.getTrends(DEVICE_ID, 31, ZONE))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.getTrends(DEVICE_ID, 7, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private void stub(List<CommuteRecord> records) {
        when(repository.findByDeviceSince(eq(deviceHash), any())).thenReturn(records);
    }

    /** 今天往前 {@code daysAgo} 天的中午，避免测试在午夜边界上抖动。 */
    private Instant atDay(int daysAgo, int hour, int minute) {
        return LocalDate.now(ZONE).minusDays(daysAgo).atTime(hour, minute).atZone(ZONE).toInstant();
    }

    /** 历史/种子记录：无幂等键、无快照、来源未知、无预计秒数。 */
    private CommuteRecord legacyRecord(int stressLevel, int daysAgo) {
        return new CommuteRecord(
                UUID.randomUUID(),
                deviceHash,
                "route-fast",
                "Fast",
                stressLevel,
                20,
                50,
                60,
                "Calm",
                40.0,
                1.1,
                0.8,
                Instant.now().minus(daysAgo, ChronoUnit.DAYS));
    }

    private CommuteRecord legacyRecordAt(String routeId, int stressLevel, Instant completedAt) {
        return new CommuteRecord(
                UUID.randomUUID(),
                deviceHash,
                routeId,
                "路线 " + routeId,
                stressLevel,
                20,
                50,
                60,
                "Calm",
                40.0,
                1.1,
                0.8,
                completedAt);
    }

    private CommuteRecord record(
            String operationId,
            UUID snapshotId,
            RouteSource routeSource,
            int stressLevel,
            Integer estimatedSeconds,
            Instant completedAt
    ) {
        return new CommuteRecord(
                UUID.randomUUID(),
                deviceHash,
                operationId,
                snapshotId,
                "route-fast",
                "最快路线 A",
                routeSource,
                stressLevel,
                estimatedSeconds == null ? 0 : estimatedSeconds / 60,
                estimatedSeconds,
                62.0,
                62.0,
                "少心累路线 B",
                43.0,
                1.12,
                0.72,
                completedAt);
    }
}
