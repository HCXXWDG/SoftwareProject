package com.example.commutemood.repository.memory;

import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;
import com.example.commutemood.repository.RouteQueryRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * demo / 内存模式的路线比较快照仓储（成员 D，任务 D01）。
 *
 * <p>与 jdbc 实现保持业务语义一致：保存返回 ID、按 ID+设备读取并做归属校验、
 * 按设备倒序返回最近记录。持久化差异：快照仅存于进程内存，服务重启即清空，
 * 对应任务书所述"demo 重启后失效"，调用方应引导重新查询而非复用旧标识。
 */
@Repository
@Profile("!postgres")
public class MemoryRouteQueryRepository implements RouteQueryRepository {

    private record StoredSnapshot(String deviceHash, RouteQueryHistory history) {
    }

    private final Map<UUID, StoredSnapshot> snapshots = new ConcurrentHashMap<>();

    @Override
    public UUID save(String deviceHash, GeoPoint origin, GeoPoint destination, RouteComparison comparison) {
        UUID id = UUID.randomUUID();
        RouteQueryHistory history = new RouteQueryHistory(id, origin, destination, comparison, Instant.now());
        snapshots.put(id, new StoredSnapshot(deviceHash, history));
        return id;
    }

    @Override
    public Optional<RouteQueryHistory> findSnapshotById(UUID id, String deviceHash) {
        StoredSnapshot stored = snapshots.get(id);
        if (stored == null || !stored.deviceHash().equals(deviceHash)) {
            return Optional.empty();
        }
        return Optional.of(stored.history());
    }

    @Override
    public List<RouteQueryHistory> findRecent(String deviceHash, int limit) {
        return snapshots.values().stream()
                .filter(stored -> stored.deviceHash().equals(deviceHash))
                .map(StoredSnapshot::history)
                .sorted(Comparator.comparing(RouteQueryHistory::createdAt).reversed())
                .limit(limit)
                .toList();
    }
}
