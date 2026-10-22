package com.example.commutemood.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * 一次已完成通勤的记录（成员 D 主责的通勤模型，任务 D02）。
 *
 * <p>D02 起，评分与预计时长来自服务端快照而非前端提交，因此新增：
 * <ul>
 *   <li>{@code operationId}：幂等键的一部分（与 {@code deviceHash} 组成唯一约束）。
 *       前端为每次通勤生成稳定操作 ID，网络重试复用同一 ID，新通勤换新 ID。</li>
 *   <li>{@code snapshotId}：本次通勤所依据的路线比较快照（D01 的查询标识），用于溯源。</li>
 *   <li>{@code routeSource}：路线来源（真实/演示/未知），演示结果不得进入真实统计。</li>
 *   <li>{@code estimatedSeconds}：快照给出的预计秒数（服务端权威）。历史分钟字段
 *       {@code durationMinutes} 仍保留以兼容旧数据与旧展示，但只作为向下取整的兼容值，
 *       不代表实测实际时长。</li>
 * </ul>
 *
 * <p>历史数据兼容：迁移前的记录没有 {@code operationId}/{@code snapshotId}/{@code routeSource}/
 * {@code estimatedSeconds}，读取时分别落为 {@code null}/{@code null}/{@link RouteSource#UNKNOWN}/{@code null}，
 * 趋势与历史页面必须能解析这些"缺字段"记录而不报错（见 D05）。
 *
 * <p><b>评分可空（V6 起）</b>：{@code selectedScore}/{@code fastestScore}/{@code confidence}
 * 都是包装类型，允许为 {@code null}。原因是路线服务可用但沿途还没有任何真实反馈时，
 * B 的快照会给出 {@link ScoringStatus#UNAVAILABLE} 且不携带评分——这种"真实用户的第一次通勤"
 * 必须能落库，但<b>不能补造分数</b>：写 0 会让趋势均值被假数据拉低，也会让前端把
 * "没有评分"显示成"压力 0 分"。因此缺就是 {@code null}，由读侧跳过而不是当 0。
 */
public record CommuteRecord(
        UUID id,
        String deviceHash,
        String operationId,
        UUID snapshotId,
        String routeId,
        String routeLabel,
        RouteSource routeSource,
        int endStressLevel,
        int durationMinutes,
        Integer estimatedSeconds,
        Double selectedScore,
        Double fastestScore,
        String alternativeLabel,
        Double alternativeScore,
        Double alternativeDurationRatio,
        Double confidence,
        Instant completedAt
) {
    /**
     * 历史/种子便捷构造器：无幂等键、无快照溯源、来源未知、无预计秒数。
     * 仅供 demo 种子数据与历史记录使用；正常完成通勤应走全字段构造器。
     */
    public CommuteRecord(
            UUID id,
            String deviceHash,
            String routeId,
            String routeLabel,
            int endStressLevel,
            int durationMinutes,
            Double selectedScore,
            Double fastestScore,
            String alternativeLabel,
            Double alternativeScore,
            Double alternativeDurationRatio,
            Double confidence,
            Instant completedAt
    ) {
        this(
                id,
                deviceHash,
                null,
                null,
                routeId,
                routeLabel,
                RouteSource.UNKNOWN,
                endStressLevel,
                durationMinutes,
                null,
                selectedScore,
                fastestScore,
                alternativeLabel,
                alternativeScore,
                alternativeDurationRatio,
                confidence,
                completedAt);
    }
}
