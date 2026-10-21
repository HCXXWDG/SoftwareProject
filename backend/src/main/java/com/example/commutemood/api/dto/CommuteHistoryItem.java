package com.example.commutemood.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 通勤历史明细项（任务 D05：历史查询结构与旧数据兼容标记）。
 *
 * <p>对应接口 {@code GET /api/v1/commutes/history}，按 {@code completedAt} 倒序返回，
 * 数组元素即本记录（与既有 {@code GET /api/v1/routes/history} 的数组风格一致）。
 *
 * <p><b>历史数据兼容</b>：D02 之前写入的记录没有 {@code operationId}、{@code snapshotId}、
 * {@code estimatedSeconds}。这些字段在本 DTO 里全部是可空类型，缺就是 {@code null}，
 * <b>不补 0、不猜测</b>；同时用两个显式标记告诉前端该怎么渲染：
 * <ul>
 *   <li>{@code legacyRecord}：{@code true} 表示这是"缺新字段的旧记录"，前端应显示
 *       "旧记录"角标，而不是把 {@code null} 当成 0 或解析失败；</li>
 *   <li>{@code missingFields}：缺失字段名清单（取值见 {@link #MISSING_*} 常量），
 *       前端可据此逐项决定隐藏还是显示占位符。</li>
 * </ul>
 *
 * <p><b>注意</b>：{@code routeSource} 为 {@code "UNKNOWN"} <u>不等于</u>旧记录。
 * 在 B 交付快照来源（B04）之前，{@code CommuteService.resolveRouteSource} 统一返回
 * {@code UNKNOWN}，因此新契约写入的记录也会是 {@code UNKNOWN}；它表示"来源未知"，
 * 由前端按来源角标处理，不放进 {@code missingFields}（该字段本身不为 null，没有"缺失"）。
 *
 * <p>本项目 Jackson 配置为 {@code default-property-inclusion: non_null}，
 * 因此值为 {@code null} 的字段在 JSON 里<b>整个键都不出现</b>。前端判定必须用
 * {@code value == null}（同时覆盖 {@code undefined}），不要用 {@code "key" in obj}。
 *
 * <p>{@code durationMinutes} 是 D02 保留的兼容字段：历史数据里它是前端提交的分钟数，
 * 新数据里它是 {@code estimatedSeconds} 向下取整的分钟值。<b>它不是实测时长</b>，
 * 展示时应优先使用 {@code estimatedSeconds}，仅在 {@code estimatedSeconds} 为
 * {@code null} 时退回 {@code durationMinutes}。
 *
 * @param completedDate            完成时间在 {@code timezone} 下的自然日，供前端按日分组，
 *                                 避免前端再用本地时区二次换算导致跨日错位
 */
public record CommuteHistoryItem(
        UUID commuteId,
        Instant completedAt,
        LocalDate completedDate,
        String timezone,
        String routeId,
        String routeLabel,
        String routeSource,
        int endStressLevel,
        Integer estimatedSeconds,
        Integer durationMinutes,
        Double selectedScore,
        Double fastestScore,
        String alternativeLabel,
        Double alternativeScore,
        Double alternativeDurationRatio,
        Double confidence,
        String operationId,
        UUID snapshotId,
        boolean legacyRecord,
        List<String> missingFields
) {

    /** {@link #missingFields()} 取值：缺幂等操作 ID（旧记录无法做写侧幂等）。 */
    public static final String MISSING_OPERATION_ID = "operationId";
    /** {@link #missingFields()} 取值：缺快照标识（无法溯源到当时的路线比较结果）。 */
    public static final String MISSING_SNAPSHOT_ID = "snapshotId";
    /** {@link #missingFields()} 取值：缺服务端预计秒数（只有兼容的分钟字段）。 */
    public static final String MISSING_ESTIMATED_SECONDS = "estimatedSeconds";
}
