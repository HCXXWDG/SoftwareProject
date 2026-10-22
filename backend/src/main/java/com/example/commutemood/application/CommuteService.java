package com.example.commutemood.application;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.FeedbackSource;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;
import com.example.commutemood.domain.RouteSource;
import com.example.commutemood.domain.ScoredRoute;
import com.example.commutemood.domain.ScoringStatus;
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
 * 归类快照来源 → 由选中的 {@link ScoredRoute} 取服务端评分/预计秒数（评分不可用时留空，
 * 不补 0）→ 按 (设备, 操作 ID) 幂等保存 → 区分 CREATED / DUPLICATE / CONFLICT。
 *
 * <p><b>演示来源不在这里拒绝</b>：{@code routeSource=DEMO} 的记录照常写入，由
 * {@link TrendService} 与 {@link CommuteHistoryService} 在读侧排除。理由是写入口一刀切
 * 会让演示模式下"完成通勤"整个动作走不通（422），而读侧排除既能完整演示又不污染真实统计。
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

        // 3) 归类快照来源（不再据此拒绝写入，见 resolveRouteSource 的说明）。
        RouteSource source = resolveRouteSource(snapshot);

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

        // 评分不可用时留空，而不是补 0：真实用户的第一次通勤（沿途还没有任何反馈）
        // 必须能落库，但补造出来的零分会污染趋势均值，也会让前端把"没有评分"显示成"压力 0 分"。
        boolean scored = hasVerifiableScoring(comparison, selected);

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
                scored ? finiteOrNull(selected.stressScore()) : null,
                scored ? finiteOrNull(fastest.stressScore()) : null,
                alternative.map(ScoredRoute::label).orElse(null),
                scored ? alternative.map(route -> finiteOrNull(route.stressScore())).orElse(null) : null,
                alternative.map(route -> route.durationSeconds() / (double) fastest.durationSeconds()).orElse(null),
                scored ? finiteOrNull(selected.confidence()) : null,
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
     * 归类快照的路线来源（B04 交付：来源、评分状态与版本随比较快照保存）。
     *
     * <p><b>这里只做归类，不做拒绝。</b>原先的实现在来源为 {@link RouteSource#DEMO} 时抛
     * {@link DemoResultRejectedException}（422），结果是演示模式下"完成通勤"这个动作根本走不通。
     * 已确认的口径是<b>「演示结果可以记录，但在读侧排除」</b>：写入时如实记下
     * {@code routeSource=DEMO}，由 {@link TrendService} 与 {@link CommuteHistoryService}
     * 在读取时把它排除在真实统计与用户明细之外（两处都已按 {@code != DEMO} 过滤，
     * 并在趋势的 {@code excludedDemoCommutes} 里计数）。这样演示能完整跑通，
     * 真实统计又不会被污染，比在写入口一刀切更符合要求。
     *
     * <p>{@code null} 来源按 {@link RouteSource#UNKNOWN} 处理，读侧会计入
     * {@code unknownSourceCommutes}，不会被当成可验证的真实数据。
     */
    private RouteSource resolveRouteSource(RouteQueryHistory snapshot) {
        RouteSource declared = snapshot.result().routeSource();
        return declared == null ? RouteSource.UNKNOWN : declared;
    }

    /**
     * 判断这次通勤是否带有"可验证的评分"。
     *
     * <p>三个条件同时成立才算：快照整体来源可验证（真实路线 + 真实反馈 + 有效评分 + 有评分版本），
     * 且选中的候选自身状态为 {@link ScoringStatus#VALID}、评分是有限数。
     *
     * <p>不成立时<b>不报错、也不补 0</b>，而是让评分字段留空落库——这正是"真实用户第一次通勤
     * （沿途还没有任何反馈）不应丢失，但不能补造分数"这条口径的落点。
     */
    private boolean hasVerifiableScoring(RouteComparison comparison, ScoredRoute selected) {
        return comparison.routeSource() == RouteSource.REAL
                && comparison.feedbackSource() == FeedbackSource.REAL
                && comparison.scoringStatus() == ScoringStatus.VALID
                && comparison.scoringVersion() != null
                && selected.scoringStatus() == ScoringStatus.VALID
                && Double.isFinite(selected.stressScore() == null ? Double.NaN : selected.stressScore())
                && Double.isFinite(selected.stressExposure() == null ? Double.NaN : selected.stressExposure());
    }

    /** 把非有限数（NaN / ±Inf）统一成 {@code null}，避免脏值落库后污染均值。 */
    private Double finiteOrNull(Double value) {
        return value != null && Double.isFinite(value) ? value : null;
    }

    /** 便捷重载：primitive 入参（如 {@code ScoredRoute.confidence} 为可空建模前的取值）。 */
    private Double finiteOrNull(double value) {
        return Double.isFinite(value) ? value : null;
    }
}
