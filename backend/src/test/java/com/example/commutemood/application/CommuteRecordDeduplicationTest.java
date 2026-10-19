package com.example.commutemood.application;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.RouteSource;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D05：同一次通勤的重复写入必须在读侧折叠，趋势才不会重复计数。
 */
class CommuteRecordDeduplicationTest {

    private static final Instant BASE = Instant.parse("2026-10-19T00:30:00Z");
    private static final String DEVICE = "device-hash";

    @Test
    void collapsesRecordsSharingOperationId() {
        String operationId = UUID.randomUUID().toString();
        CommuteRecord first = record(operationId, null, "route-fast", 50, BASE);
        CommuteRecord replay = record(operationId, null, "route-fast", 50, BASE.plusSeconds(90));

        List<CommuteRecord> result = CommuteRecordDeduplication.deduplicate(List.of(first, replay));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).id()).isEqualTo(first.id());
        assertThat(CommuteRecordDeduplication.duplicateCount(List.of(first, replay))).isEqualTo(1);
    }

    @Test
    void collapsesLegacyRecordsWithoutOperationIdOrSnapshot() {
        // 历史记录：没有 operationId/snapshotId，重放写入落在同一分钟
        CommuteRecord first = record(null, null, "route-fast", 50, BASE);
        CommuteRecord replay = record(null, null, "route-fast", 50, BASE.plusSeconds(20));

        assertThat(CommuteRecordDeduplication.deduplicate(List.of(first, replay))).hasSize(1);
    }

    @Test
    void keepsLegacyRecordsInDifferentMinutes() {
        CommuteRecord morning = record(null, null, "route-fast", 50, BASE);
        CommuteRecord evening = record(null, null, "route-fast", 50, BASE.plus(12, ChronoUnit.HOURS));

        assertThat(CommuteRecordDeduplication.deduplicate(List.of(morning, evening))).hasSize(2);
    }

    @Test
    void keepsLegacyRecordsWithSameMinuteButDifferentStress() {
        CommuteRecord first = record(null, null, "route-fast", 50, BASE);
        CommuteRecord second = record(null, null, "route-fast", 75, BASE.plusSeconds(10));

        assertThat(CommuteRecordDeduplication.deduplicate(List.of(first, second))).hasSize(2);
    }

    @Test
    void keepsLegacyRecordsWithSameMinuteButDifferentRoute() {
        CommuteRecord fast = record(null, null, "route-fast", 50, BASE);
        CommuteRecord calm = record(null, null, "route-calm", 50, BASE.plusSeconds(10));

        assertThat(CommuteRecordDeduplication.deduplicate(List.of(fast, calm))).hasSize(2);
    }

    @Test
    void collapsesRecordsSharingSnapshotRouteAndMinute() {
        UUID snapshotId = UUID.randomUUID();
        CommuteRecord first = record(null, snapshotId, "route-fast", 50, BASE);
        CommuteRecord replay = record(null, snapshotId, "route-fast", 50, BASE.plusSeconds(30));

        assertThat(CommuteRecordDeduplication.deduplicate(List.of(first, replay))).hasSize(1);
    }

    @Test
    void keepsRecordsFromDifferentSnapshotsInSameMinute() {
        CommuteRecord first = record(null, UUID.randomUUID(), "route-fast", 50, BASE);
        CommuteRecord second = record(null, UUID.randomUUID(), "route-fast", 50, BASE.plusSeconds(30));

        assertThat(CommuteRecordDeduplication.deduplicate(List.of(first, second))).hasSize(2);
    }

    @Test
    void treatsBlankOperationIdAsMissing() {
        CommuteRecord first = record("   ", null, "route-fast", 50, BASE);
        CommuteRecord replay = record("   ", null, "route-fast", 50, BASE.plusSeconds(10));

        // 空白操作 ID 不能当成"所有空 ID 都是同一次"，要退回历史口径按分钟+路线+压力判定
        assertThat(CommuteRecordDeduplication.dedupeKey(first)).startsWith("legacy:");
        assertThat(CommuteRecordDeduplication.deduplicate(List.of(first, replay))).hasSize(1);
    }

    @Test
    void sortsAscendingByCompletedAtRegardlessOfInputOrder() {
        CommuteRecord oldest = record(null, null, "route-fast", 25, BASE.minusSeconds(600));
        CommuteRecord middle = record(null, null, "route-calm", 50, BASE);
        CommuteRecord newest = record(null, null, "route-fast", 75, BASE.plusSeconds(600));

        List<CommuteRecord> result = CommuteRecordDeduplication
                .deduplicate(List.of(newest, oldest, middle));

        assertThat(result).containsExactly(oldest, middle, newest);
    }

    @Test
    void returnsEmptyForNullOrEmptyInput() {
        assertThat(CommuteRecordDeduplication.deduplicate(null)).isEmpty();
        assertThat(CommuteRecordDeduplication.deduplicate(List.of())).isEmpty();
        assertThat(CommuteRecordDeduplication.duplicateCount(null)).isZero();
    }

    private CommuteRecord record(
            String operationId,
            UUID snapshotId,
            String routeId,
            int stressLevel,
            Instant completedAt
    ) {
        return new CommuteRecord(
                UUID.randomUUID(),
                DEVICE,
                operationId,
                snapshotId,
                routeId,
                "路线 " + routeId,
                RouteSource.REAL,
                stressLevel,
                20,
                1200,
                62.0,
                62.0,
                "少心累路线 B",
                43.0,
                1.1,
                0.72,
                completedAt);
    }
}
