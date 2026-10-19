package com.example.commutemood.repository.memory;

import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class MemoryRouteQueryRepositoryTest {

    private final MemoryRouteQueryRepository repository = new MemoryRouteQueryRepository();
    private final GeoPoint origin = new GeoPoint(116.392, 39.905);
    private final GeoPoint destination = new GeoPoint(116.405, 39.912);
    private final RouteComparison comparison =
            new RouteComparison(List.of(), "route-fast", "route-calm", "ok", false);

    @Test
    void saveReturnsIdAndSnapshotIsReadableByOwnerDevice() {
        UUID id = repository.save("device-a", origin, destination, comparison);

        assertThat(id).isNotNull();

        Optional<RouteQueryHistory> found = repository.findSnapshotById(id, "device-a");
        assertThat(found).isPresent();
        assertThat(found.get().id()).isEqualTo(id);
        assertThat(found.get().origin()).isEqualTo(origin);
        assertThat(found.get().destination()).isEqualTo(destination);
        assertThat(found.get().result()).isEqualTo(comparison);
        assertThat(found.get().createdAt()).isNotNull();
    }

    @Test
    void findSnapshotByIdIsScopedToDeviceOwnership() {
        UUID id = repository.save("device-a", origin, destination, comparison);

        // 别的设备拿不到该快照（归属校验）
        assertThat(repository.findSnapshotById(id, "device-b")).isEmpty();
        // 未知 ID 也返回空
        assertThat(repository.findSnapshotById(UUID.randomUUID(), "device-a")).isEmpty();
    }

    @Test
    void findRecentFiltersByDeviceOrdersByCreatedAtDescAndAppliesLimit() throws InterruptedException {
        repository.save("device-a", origin, destination, comparison);
        Thread.sleep(5);
        UUID second = repository.save("device-a", origin, destination, comparison);
        Thread.sleep(5);
        UUID third = repository.save("device-a", origin, destination, comparison);
        // 其他设备的记录不应出现
        repository.save("device-b", origin, destination, comparison);

        List<RouteQueryHistory> recent = repository.findRecent("device-a", 2);

        assertThat(recent).hasSize(2);
        // 倒序：最新的在前
        assertThat(recent.get(0).id()).isEqualTo(third);
        assertThat(recent.get(1).id()).isEqualTo(second);
    }

    @Test
    void isExpiredDistinguishesStaleFromFreshSnapshots() {
        UUID id = repository.save("device-a", origin, destination, comparison);
        RouteQueryHistory snapshot = repository.findSnapshotById(id, "device-a").orElseThrow();
        Duration maxAge = Duration.ofMinutes(10);

        // 刚保存的快照在有效期内
        assertThat(repository.isExpired(snapshot, Instant.now(), maxAge)).isFalse();
        // 时间推进到超过有效期之后即判为过期
        Instant future = snapshot.createdAt().plus(maxAge).plusSeconds(1);
        assertThat(repository.isExpired(snapshot, future, maxAge)).isTrue();
    }
}
