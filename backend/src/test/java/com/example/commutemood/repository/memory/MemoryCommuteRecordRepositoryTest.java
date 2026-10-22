package com.example.commutemood.repository.memory;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.RouteSource;
import com.example.commutemood.repository.CommuteSaveResult;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class MemoryCommuteRecordRepositoryTest {

    private final MemoryCommuteRecordRepository repository = new MemoryCommuteRecordRepository();

    private CommuteRecord record(String operationId, String routeId, Instant completedAt) {
        return new CommuteRecord(
                UUID.randomUUID(),
                "device-hash",
                operationId,
                UUID.randomUUID(),
                routeId,
                "label-" + routeId,
                RouteSource.UNKNOWN,
                50,
                18,
                1080,
                62.0,
                62.0,
                null,
                null,
                null,
                0.72,
                completedAt);
    }

    @Test
    void saveIfAbsentCreatesThenReturnsExistingForSameOperationId() {
        CommuteRecord first = record("op-1", "route-fast", Instant.now());

        CommuteSaveResult created = repository.saveIfAbsent(first);
        CommuteSaveResult again = repository.saveIfAbsent(record("op-1", "route-fast", Instant.now()));

        assertThat(created.created()).isTrue();
        assertThat(again.created()).isFalse();
        // 幂等：返回的是已存在的那条（同一 id），不是新提交的
        assertThat(again.record().id()).isEqualTo(first.id());
        assertThat(repository.findByOperationId("device-hash", "op-1")).contains(first);
    }

    @Test
    void saveIfAbsentIsScopedByDevice() {
        CommuteRecord first = record("op-1", "route-fast", Instant.now());
        repository.saveIfAbsent(first);

        // 相同 operationId 但不同设备：不应命中同一条（本用例通过不同 deviceHash 验证隔离）
        CommuteRecord otherDevice = new CommuteRecord(
                UUID.randomUUID(), "other-device", "op-1", UUID.randomUUID(),
                "route-fast", "label", RouteSource.UNKNOWN, 50, 18, 1080,
                62.0, 62.0, null, null, null, 0.72, Instant.now());
        CommuteSaveResult result = repository.saveIfAbsent(otherDevice);

        assertThat(result.created()).isTrue();
    }

    @Test
    void saveIfAbsentWithoutOperationIdAlwaysCreates() {
        CommuteSaveResult first = repository.saveIfAbsent(record(null, "route-fast", Instant.now()));
        CommuteSaveResult second = repository.saveIfAbsent(record(null, "route-fast", Instant.now()));

        assertThat(first.created()).isTrue();
        assertThat(second.created()).isTrue();
    }

    @Test
    void findByDeviceSinceFiltersByDeviceAndSortsAscending() {
        Instant base = Instant.parse("2026-10-18T00:00:00Z");
        repository.saveIfAbsent(record("op-1", "route-fast", base.plusSeconds(3600)));
        repository.saveIfAbsent(record("op-2", "route-calm", base));
        repository.saveIfAbsent(record("op-3", "route-scenic", base.minusSeconds(7200)));

        List<CommuteRecord> since = repository.findByDeviceSince("device-hash", base.minusSeconds(3600));

        assertThat(since).hasSize(2);
        assertThat(since.get(0).operationId()).isEqualTo("op-2");
        assertThat(since.get(1).operationId()).isEqualTo("op-1");
    }
}
