package com.example.commutemood.application;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;
import com.example.commutemood.domain.RouteSource;
import com.example.commutemood.domain.ScoredRoute;
import com.example.commutemood.repository.CommuteRecordRepository;
import com.example.commutemood.repository.CommuteSaveResult;
import com.example.commutemood.repository.RouteQueryRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * 完成通勤服务（成员 D 主责，任务 D02）。
 *
 * <p>核心原则：评分与预计时长来自服务端快照，前端无法篡改。前端只提交
 * {@code snapshotId}（D01 查询标识）、{@code operationId}（幂等键）、选中的 {@code routeId}
 * 与用户感受 {@code endStressLevel}；其余字段一律由快照重建。
 *
 * <p>流程：按 ID+设备读快照（归属校验）→ 过期判断 → 校验 routeId 在快照候选内 →
 * 拒绝演示来源 → 由选中的 {@link ScoredRoute} 取服务端评分/预计秒数 → 按
 * (设备, 操作 ID) 幂等保存 → 区分 CREATED / DUPLICATE / CONFLICT。
 */
@Service
public class CommuteService {
    private static final Set<Integer> VALID_STRESS_LEVELS = Set.of(0, 25, 50, 75, 100);

    /**
     * 快照有效期（S00 契约第 2 项"过期策略"，由 D 定义）。超过此时长的快照不可用于完成通勤，
     * 前端需重新规划路线。取值兼顾"通勤途中完成"与"避免复用陈旧评分"。
     */
    private static final Duration SNAPSHOT_MAX_AGE = Duration.ofMinutes(30);

    private final CommuteRecordRepository repository;
    private final RouteQueryRepository routeQueryRepository;
    private final DeviceIdentityService identityService;

    public CommuteService(
            CommuteRecordRepository repository,
            RouteQueryRepository routeQueryRepository,
            DeviceIdentityService identityService
    ) {
        this.repository = repository;
        this.routeQueryRepository = routeQueryRepository;
        this.identityService = identityService;
    }

    /**
     * 完成一次通勤。
     *
     * @param rawDeviceId    原始设备标识（内部哈希后使用）
     * @param snapshotId     D01 返回的路线比较快照查询标识
     * @param operationId    幂等键：同一通勤的重试复用同一 ID，新通勤换新 ID
     * @param routeId        用户在快照候选中选中的路线 ID
     * @param endStressLevel 用户到达时的主观感受（0/25/50/75/100），这是合法的前端输入
     * @param completedAt    可选完成时间，为空则取服务端当前时间
     */
    public CommuteCompletion complete(
            String rawDeviceId,
            UUID snapshotId,
            String operationId,
            String routeId,
            int endStressLevel,
            Instant completedAt
    ) {
        if (snapshotId == null) {
            throw new IllegalArgumentException("snapshotId is required");
        }
        if (operationId == null || operationId.isBlank()) {
            throw new IllegalArgumentException("operationId is required");
        }
        if (routeId == null || routeId.isBlank()) {
            throw new IllegalArgumentException("routeId is required");
        }
        if (!VALID_STRESS_LEVELS.contains(endStressLevel)) {
            throw new IllegalArgumentException("endStressLevel must be one of 0, 25, 50, 75, 100");
        }

        String deviceHash = identityService.hash(rawDeviceId);
        Instant now = Instant.now();

        // 1) 按 ID + 设备读快照（归属校验）：别的设备或 demo 重启后读不到。
        RouteQueryHistory snapshot = routeQueryRepository.findSnapshotById(snapshotId, deviceHash)
                .orElseThrow(() -> new SnapshotMissingException(
                        "查询快照不存在或不属于该设备，请重新规划路线。"));

        // 2) 过期判断：与"缺失"区分，前端据此提示重新查询。
        if (routeQueryRepository.isExpired(snapshot, now, SNAPSHOT_MAX_AGE)) {
            throw new SnapshotExpiredException("查询快照已过期，请重新规划路线。");
        }

        // 3) 拒绝演示结果进入真实统计（依赖 B04 快照来源，见 resolveRouteSource）。
        RouteSource source = resolveRouteSource(snapshot);
        if (source == RouteSource.DEMO) {
            throw new DemoResultRejectedException("演示路线结果不计入真实通勤统计。");
        }

        // 4) 从快照重建服务端评分与预计时长，前端传入的分数一律不采信。
        RouteComparison comparison = snapshot.result();
        List<ScoredRoute> routes = comparison.routes();
        ScoredRoute selected = routes.stream()
                .filter(route -> route.id().equals(routeId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("routeId 不在该快照的候选路线中"));
        ScoredRoute fastest = routes.stream()
                .filter(ScoredRoute::fastest)
                .findFirst()
                .or(() -> routes.stream()
                        .filter(route -> route.id().equals(comparison.fastestRouteId()))
                        .findFirst())
                .orElse(selected);
        Optional<ScoredRoute> alternative = routes.stream()
                .filter(ScoredRoute::leastStressful)
                .findFirst()
                .or(() -> routes.stream()
                        .filter(route -> route.id().equals(comparison.leastStressfulRouteId()))
                        .findFirst())
                .filter(route -> !route.id().equals(selected.id()));

        int estimatedSeconds = selected.durationSeconds();
        int durationMinutes = Math.max(1, (int) Math.ceil(estimatedSeconds / 60.0));

        CommuteRecord candidate = new CommuteRecord(
                UUID.randomUUID(),
                deviceHash,
                operationId,
                snapshotId,
                routeId,
                selected.label(),
                source,
                endStressLevel,
                durationMinutes,
                estimatedSeconds,
                selected.stressScore(),
                fastest.stressScore(),
                alternative.map(ScoredRoute::label).orElse(null),
                alternative.map(ScoredRoute::stressScore).map(Double::valueOf).orElse(null),
                alternative.map(route -> route.durationSeconds() / (double) fastest.durationSeconds()).orElse(null),
                selected.confidence(),
                completedAt == null ? now : completedAt);

        // 5) 幂等保存：并发重复只写一条。
        CommuteSaveResult result = repository.saveIfAbsent(candidate);
        if (result.created()) {
            return new CommuteCompletion(CommuteCompletion.Outcome.CREATED, result.record());
        }
        CommuteRecord existing = result.record();
        if (existing == null) {
            // 冲突但回读不到（极端并发/存储异常）：保守按冲突处理，不谎报成功。
            return new CommuteCompletion(CommuteCompletion.Outcome.CONFLICT, candidate);
        }
        if (sameBusinessContent(existing, candidate)) {
            return new CommuteCompletion(CommuteCompletion.Outcome.DUPLICATE, existing);
        }
        return new CommuteCompletion(CommuteCompletion.Outcome.CONFLICT, existing);
    }

    /**
     * 业务内容一致性：决定重复提交是"重复成功"还是"操作 ID 冲突"。
     * 只比较前端可控的业务输入；评分等由快照派生，给定 snapshotId+routeId 即确定。
     */
    private boolean sameBusinessContent(CommuteRecord existing, CommuteRecord candidate) {
        return Objects.equals(existing.snapshotId(), candidate.snapshotId())
                && Objects.equals(existing.routeId(), candidate.routeId())
                && existing.endStressLevel() == candidate.endStressLevel();
    }

    /**
     * 解析快照的路线来源。
     *
     * <p>B04 的来源、评分状态和版本随比较快照保存。只有可验证的真实结果允许创建新通勤；
     * 旧快照来源未知时必须重新规划。已有历史记录仍由 D05 的读侧兼容规则处理。
     */
    private RouteSource resolveRouteSource(RouteQueryHistory snapshot) {
        RouteComparison comparison = snapshot.result();
        if (comparison.routeSource() == RouteSource.DEMO) {
            return RouteSource.DEMO;
        }
        if (comparison.routeSource() != RouteSource.REAL
                || comparison.feedbackSource() != com.example.commutemood.domain.FeedbackSource.REAL
                || comparison.scoringStatus() != com.example.commutemood.domain.ScoringStatus.VALID
                || comparison.scoringVersion() == null || comparison.routes().isEmpty()
                || comparison.routes().stream().anyMatch(route -> route.stressScore() == null
                || route.stressExposure() == null || !Double.isFinite(route.stressScore())
                || !Double.isFinite(route.stressExposure()) || route.durationSeconds() <= 0)) {
            throw new IllegalArgumentException("路线快照没有可验证的真实评分，请重新规划后完成通勤。");
        }
        return RouteSource.REAL;
    }
}
