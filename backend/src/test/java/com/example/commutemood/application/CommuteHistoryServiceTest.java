package com.example.commutemood.application;

import com.example.commutemood.api.dto.CommuteHistoryItem;
import com.example.commutemood.config.AppProperties;
import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.RouteSource;
import com.example.commutemood.repository.CommuteRecordRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
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
 * D05：历史查询结构与旧数据兼容标记。
 */
class CommuteHistoryServiceTest {

    private static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");
    private static final String DEVICE_ID = "history-device";

    private final CommuteRecordRepository repository = mock(CommuteRecordRepository.class);
    private final DeviceIdentityService identityService = new DeviceIdentityService(
            new AppProperties("test-salt", new AppProperties.Amap(""), "http://localhost:5173"));
    private final CommuteHistoryService service = new CommuteHistoryService(repository, identityService);
    private final String deviceHash = identityService.hash(DEVICE_ID);

    @Test
    void returnsRecordsNewestFirst() {
        stub(List.of(
                fullRecord("op-1", RouteSource.REAL, 50, atDay(2, 8, 0)),
                fullRecord("op-2", RouteSource.REAL, 25, atDay(0, 18, 0)),
                fullRecord("op-3", RouteSource.REAL, 75, atDay(1, 8, 0))));

        List<CommuteHistoryItem> items = service.getHistory(DEVICE_ID, 20, 30, SHANGHAI);

        assertThat(items).hasSize(3);
        assertThat(items.get(0).endStressLevel()).isEqualTo(25);
        assertThat(items.get(2).endStressLevel()).isEqualTo(50);
        assertThat(items).extracting(CommuteHistoryItem::completedAt).isSortedAccordingTo(
                (left, right) -> right.compareTo(left));
    }

    @Test
    void marksLegacyRecordsExplicitlyInsteadOfGuessing() {
        stub(List.of(legacyRecord(50, atDay(1, 8, 0))));

        CommuteHistoryItem item = service.getHistory(DEVICE_ID, 20, 30, SHANGHAI).get(0);

        assertThat(item.legacyRecord()).isTrue();
        assertThat(item.routeSource()).isEqualTo("UNKNOWN");
        assertThat(item.operationId()).isNull();
        assertThat(item.snapshotId()).isNull();
        assertThat(item.estimatedSeconds()).isNull();
        assertThat(item.missingFields()).containsExactly(
                CommuteHistoryItem.MISSING_OPERATION_ID,
                CommuteHistoryItem.MISSING_SNAPSHOT_ID,
                CommuteHistoryItem.MISSING_ESTIMATED_SECONDS);
        // 兼容字段仍在，前端可退回展示分钟数
        assertThat(item.durationMinutes()).isEqualTo(20);
    }

    @Test
    void reportsNoMissingFieldsForSnapshotBackedRecords() {
        stub(List.of(fullRecord("op-1", RouteSource.REAL, 50, atDay(0, 8, 0))));

        CommuteHistoryItem item = service.getHistory(DEVICE_ID, 20, 30, SHANGHAI).get(0);

        assertThat(item.legacyRecord()).isFalse();
        assertThat(item.missingFields()).isEmpty();
        assertThat(item.routeSource()).isEqualTo("REAL");
        assertThat(item.estimatedSeconds()).isEqualTo(1500);
        assertThat(item.snapshotId()).isNotNull();
    }

    @Test
    void keepsUnknownSourceVisibleWithoutMarkingRecordAsLegacy() {
        // B04 交付快照来源之前，新契约记录的来源也是 UNKNOWN；它是"来源未知"，不是"旧记录"
        stub(List.of(fullRecord("op-1", RouteSource.UNKNOWN, 50, atDay(0, 8, 0))));

        CommuteHistoryItem item = service.getHistory(DEVICE_ID, 20, 30, SHANGHAI).get(0);

        assertThat(item.routeSource()).isEqualTo("UNKNOWN");
        assertThat(item.legacyRecord()).isFalse();
        assertThat(item.missingFields()).isEmpty();
    }

    @Test
    void excludesDemoRecordsFromHistory() {
        stub(List.of(
                fullRecord("op-demo", RouteSource.DEMO, 90, atDay(0, 8, 0)),
                fullRecord("op-real", RouteSource.REAL, 40, atDay(0, 18, 0))));

        List<CommuteHistoryItem> items = service.getHistory(DEVICE_ID, 20, 30, SHANGHAI);

        assertThat(items).hasSize(1);
        assertThat(items.get(0).routeSource()).isEqualTo("REAL");
    }

    @Test
    void collapsesRepeatedWritesOfSameCommute() {
        String operationId = UUID.randomUUID().toString();
        Instant completedAt = atDay(0, 8, 15);
        stub(List.of(
                record(operationId, null, RouteSource.REAL, 50, 1500, completedAt),
                record(operationId, null, RouteSource.REAL, 50, 1500, completedAt.plusSeconds(40))));

        assertThat(service.getHistory(DEVICE_ID, 20, 30, SHANGHAI)).hasSize(1);
    }

    @Test
    void respectsLimit() {
        stub(List.of(
                fullRecord("op-1", RouteSource.REAL, 10, atDay(4, 8, 0)),
                fullRecord("op-2", RouteSource.REAL, 20, atDay(3, 8, 0)),
                fullRecord("op-3", RouteSource.REAL, 30, atDay(2, 8, 0)),
                fullRecord("op-4", RouteSource.REAL, 40, atDay(1, 8, 0))));

        List<CommuteHistoryItem> items = service.getHistory(DEVICE_ID, 2, 30, SHANGHAI);

        assertThat(items).hasSize(2);
        assertThat(items).extracting(CommuteHistoryItem::endStressLevel).containsExactly(40, 30);
    }

    @Test
    void computesCompletedDateInRequestedTimezone() {
        // 上海今天 00:30 == UTC 昨天 16:30：同一条记录跨日，日期必须随请求时区变化
        Instant crossDay = LocalDate.now(SHANGHAI).atTime(0, 30).atZone(SHANGHAI).toInstant();
        stub(List.of(fullRecord("op-1", RouteSource.REAL, 50, crossDay)));

        assertThat(service.getHistory(DEVICE_ID, 20, 30, SHANGHAI).get(0).completedDate())
                .isEqualTo(LocalDate.now(SHANGHAI));
        assertThat(service.getHistory(DEVICE_ID, 20, 30, ZoneOffset.UTC).get(0).completedDate())
                .isEqualTo(LocalDate.now(SHANGHAI).minusDays(1));
    }

    @Test
    void queriesFromStartOfFirstCalendarDay() {
        stub(List.of());

        service.getHistory(DEVICE_ID, 20, 7, SHANGHAI);

        ArgumentCaptor<Instant> since = ArgumentCaptor.forClass(Instant.class);
        verify(repository).findByDeviceSince(eq(deviceHash), since.capture());
        assertThat(since.getValue())
                .isEqualTo(LocalDate.now(SHANGHAI).minusDays(6).atStartOfDay(SHANGHAI).toInstant());
    }

    @Test
    void returnsEmptyListForNewDevice() {
        stub(List.of());

        assertThat(service.getHistory(DEVICE_ID, 20, 30, SHANGHAI)).isEmpty();
    }

    @Test
    void rejectsInvalidLimitDaysAndTimezone() {
        assertThatThrownBy(() -> service.getHistory(DEVICE_ID, 0, 30, SHANGHAI))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("limit");
        assertThatThrownBy(() -> service.getHistory(DEVICE_ID, 101, 30, SHANGHAI))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.getHistory(DEVICE_ID, 20, 0, SHANGHAI))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("days");
        assertThatThrownBy(() -> service.getHistory(DEVICE_ID, 20, 91, SHANGHAI))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.getHistory(DEVICE_ID, 20, 30, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private void stub(List<CommuteRecord> records) {
        when(repository.findByDeviceSince(eq(deviceHash), any())).thenReturn(records);
    }

    private Instant atDay(int daysAgo, int hour, int minute) {
        return LocalDate.now(SHANGHAI).minusDays(daysAgo).atTime(hour, minute)
                .atZone(SHANGHAI).toInstant();
    }

    private CommuteRecord legacyRecord(int stressLevel, Instant completedAt) {
        return new CommuteRecord(
                UUID.randomUUID(),
                deviceHash,
                "route-fast",
                "最快路线 A",
                stressLevel,
                20,
                50,
                60,
                "少心累路线 B",
                40.0,
                1.1,
                0.8,
                completedAt);
    }

    private CommuteRecord fullRecord(String operationId, RouteSource source, int stress, Instant completedAt) {
        return record(operationId, UUID.randomUUID(), source, stress, 1500, completedAt);
    }

    private CommuteRecord record(
            String operationId,
            UUID snapshotId,
            RouteSource source,
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
                source,
                stressLevel,
                estimatedSeconds == null ? 20 : estimatedSeconds / 60,
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
