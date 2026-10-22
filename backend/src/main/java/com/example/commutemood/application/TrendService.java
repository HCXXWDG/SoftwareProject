package com.example.commutemood.application;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.RouteSource;
import com.example.commutemood.repository.CommuteRecordRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 通勤趋势统计（成员 D 主责，任务 D05 校订口径）。
 *
 * <p>D05 明确的四条口径，前端（A/C）与后端必须一致：
 * <ol>
 *   <li><b>日期与时区</b>：窗口按"请求时区下的自然日"切分，起点是
 *       {@code today.minusDays(days - 1)} 当天 00:00（含），终点是今天（含）。
 *       查询下界与分桶下界是同一个时刻，因此不会出现"滚动 7×24 小时"多出一段
 *       跨日残片、被 {@code computeIfAbsent} 追加成额外桶的情况。</li>
 *   <li><b>空日期</b>：{@code points} 恒为 {@code days} 个、日期严格升序、无缺口；
 *       没有记录的日期 {@code averageStress} 与 {@code averageEstimatedSeconds} 为
 *       {@code null}（<b>不补零</b>），{@code commuteCount} 为 0，C 的折线图据此断开。</li>
 *   <li><b>预计时长</b>：只统计快照给出的 {@code estimatedSeconds}，样本数为
 *       {@code estimatedSampleCount}；历史记录没有该字段时保持 {@code null}，
 *       不用 {@code durationMinutes} 反推、不填 0。</li>
 *   <li><b>来源筛选</b>：{@link RouteSource#DEMO} 的记录不进入任何统计，只在
 *       {@code excludedDemoCommutes} 里计数；<b>非 {@link RouteSource#REAL} 的其余取值</b>
 *       （历史数据的 {@link RouteSource#UNKNOWN}、{@code null}，以及将来新增的取值）
 *       照常计入但在 {@code unknownSourceCommutes} 里显式标记，不当作可验证的真实评分。
 *       判定写成"不等于 REAL"而不是"等于 UNKNOWN"，这样 {@code RouteSource} 再加枚举值时
 *       新来源不会被悄悄算成真实数据。</li>
 * </ol>
 *
 * <p>另外，{@code totalCommutes} 是"窗口内被计入的通勤次数"，等于各日 {@code commuteCount}
 * 之和；同一次通勤的重复写入由 {@link CommuteRecordDeduplication} 在读侧折叠，
 * 折叠条数在 {@code deduplicatedCommutes} 里可见。
 */
@Service
public class TrendService {

    /** 趋势窗口上限（天）。超过这个范围的折线图在前端不可读，也放大历史数据兼容风险。 */
    private static final int MAX_DAYS = 30;

    private final CommuteRecordRepository repository;
    private final DeviceIdentityService identityService;

    public TrendService(
            CommuteRecordRepository repository,
            DeviceIdentityService identityService
    ) {
        this.repository = repository;
        this.identityService = identityService;
    }

    public TrendResult getTrends(String rawDeviceId, int days, ZoneId zoneId) {
        if (days < 1 || days > MAX_DAYS) {
            throw new IllegalArgumentException("days must be between 1 and " + MAX_DAYS);
        }
        if (zoneId == null) {
            throw new IllegalArgumentException("timezone is required");
        }
        String deviceHash = identityService.hash(rawDeviceId);

        // 口径 1：窗口下界 = 起始自然日的 00:00（请求时区），与分桶边界完全一致。
        LocalDate today = LocalDate.now(zoneId);
        LocalDate startDate = today.minusDays(days - 1L);
        Instant since = startDate.atStartOfDay(zoneId).toInstant();

        List<CommuteRecord> fetched = repository.findByDeviceSince(deviceHash, since);
        List<CommuteRecord> unique = CommuteRecordDeduplication.deduplicate(fetched);
        int deduplicated = CommuteRecordDeduplication.duplicateCount(fetched);

        // 口径 4：演示来源不进入统计；未知来源计入但单独标记。
        List<CommuteRecord> counted = new ArrayList<>(unique.size());
        int excludedDemo = 0;
        int unknownSource = 0;
        int outOfWindow = 0;
        for (CommuteRecord record : unique) {
            if (record.routeSource() == RouteSource.DEMO) {
                excludedDemo++;
                continue;
            }
            if (!isWithinWindow(record.completedAt(), startDate, today, zoneId)) {
                // 客户端可提交 completedAt，未来时间或过早时间不塞进任何自然日桶，
                // 否则 points 会失去升序、前端折线图错位。
                outOfWindow++;
                continue;
            }
            if (record.routeSource() != RouteSource.REAL) {
                // 只有 REAL 算"来源可验证"。非 REAL（历史数据的 UNKNOWN、来源为 null，
                // 以及将来新增的枚举取值如 UNAVAILABLE）一律按未知口径计数：照常进统计，
                // 但显式标记，避免枚举扩展时新来源被悄悄当成真实评分。
                unknownSource++;
            }
            counted.add(record);
        }

        // 口径 2：先按日期建满 days 个桶，保证升序且无缺口。
        Map<LocalDate, List<CommuteRecord>> byDay = new LinkedHashMap<>();
        for (int offset = days - 1; offset >= 0; offset--) {
            byDay.put(today.minusDays(offset), new ArrayList<>());
        }
        for (CommuteRecord record : counted) {
            byDay.get(record.completedAt().atZone(zoneId).toLocalDate()).add(record);
        }

        List<TrendPoint> points = byDay.entrySet().stream()
                .map(entry -> toPoint(entry.getKey(), entry.getValue()))
                .toList();

        return new TrendResult(
                points,
                buildRecommendation(counted),
                counted.size(),
                buildSummary(counted),
                days,
                zoneId.getId(),
                unknownSource,
                excludedDemo,
                deduplicated,
                outOfWindow);
    }

    private TrendPoint toPoint(LocalDate date, List<CommuteRecord> dayRecords) {
        if (dayRecords.isEmpty()) {
            return new TrendPoint(date, null, 0, null, 0);
        }
        Double averageStress = round(dayRecords.stream()
                .mapToInt(CommuteRecord::endStressLevel)
                .average()
                .orElse(0));
        // 口径 3：只对有 estimatedSeconds 的记录求均值，没有样本就是 null。
        List<Integer> estimates = dayRecords.stream()
                .map(CommuteRecord::estimatedSeconds)
                .filter(Objects::nonNull)
                .toList();
        Double averageEstimatedSeconds = estimates.isEmpty()
                ? null
                : round(estimates.stream().mapToInt(Integer::intValue).average().orElse(0));
        return new TrendPoint(date, averageStress, dayRecords.size(),
                averageEstimatedSeconds, estimates.size());
    }

    private boolean isWithinWindow(Instant completedAt, LocalDate startDate, LocalDate today, ZoneId zoneId) {
        if (completedAt == null) {
            return false;
        }
        LocalDate date = completedAt.atZone(zoneId).toLocalDate();
        return !date.isBefore(startDate) && !date.isAfter(today);
    }

    private String buildRecommendation(List<CommuteRecord> records) {
        if (records.isEmpty()) {
            return "完成一次通勤后，这里会给出次日路线建议。";
        }
        CommuteRecord latest = records.get(records.size() - 1);
        // 评分自 V6 起可空：真实路线但沿途还没有反馈时不携带评分，此时不补 0，
        // 直接判定为"不足以推荐替代路线"，避免用假零分算出"替代路线更从容"。
        boolean recommendAlternative = latest.alternativeLabel() != null
                && latest.alternativeScore() != null
                && latest.alternativeDurationRatio() != null
                && latest.fastestScore() != null
                && latest.confidence() != null
                && latest.fastestScore() - latest.alternativeScore() >= 10
                && latest.alternativeDurationRatio() <= 1.20
                && latest.confidence() >= 0.35;
        if (recommendAlternative) {
            return "明天试 " + latest.alternativeLabel() + "，预计更从容。";
        }
        return "继续积累沿途反馈，当前优先选择最快路线。";
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private TrendSummary buildSummary(List<CommuteRecord> records) {
        if (records.isEmpty()) {
            return new TrendSummary(null, null, "unknown", false);
        }
        double averageStress = round(records.stream()
                .mapToInt(CommuteRecord::endStressLevel)
                .average()
                .orElse(0));
        if (records.size() < 2) {
            return new TrendSummary(averageStress, null, "unknown", false);
        }

        int midpoint = records.size() / 2;
        double earlierAverage = average(records.subList(0, midpoint));
        double recentAverage = average(records.subList(midpoint, records.size()));
        double delta = round(recentAverage - earlierAverage);
        return new TrendSummary(averageStress, delta, trendDirection(delta), records.size() >= 3);
    }

    private double average(List<CommuteRecord> records) {
        return records.stream()
                .mapToInt(CommuteRecord::endStressLevel)
                .average()
                .orElse(0);
    }

    private String trendDirection(double delta) {
        if (delta <= -5) {
            return "improving";
        }
        if (delta >= 5) {
            return "worsening";
        }
        return "stable";
    }

    /**
     * 一天的趋势点。
     *
     * <p>{@code averageStress} 与 {@code averageEstimatedSeconds} 在当天没有记录时为
     * {@code null}（不补零）；{@code estimatedSampleCount} 是参与预计时长均值的样本数，
     * 历史记录缺少 {@code estimatedSeconds} 时会小于 {@code commuteCount}，前端据此
     * 决定是否展示时长，而不是把 0 当成"用时 0 秒"。
     */
    public record TrendPoint(
            LocalDate date,
            Double averageStress,
            int commuteCount,
            Double averageEstimatedSeconds,
            int estimatedSampleCount
    ) {
    }

    public record TrendSummary(
            Double averageStress,
            Double stressDelta,
            String direction,
            boolean sampleSufficient
    ) {
    }

    /**
     * 趋势响应。前四个字段是既有契约（前端 {@code TrendResult} 已使用），其余为 D05 追加，
     * 只增不改，旧前端忽略即可。
     *
     * @param days                  本次窗口的自然日天数（回显，便于前端校对）
     * @param timezone              本次分桶使用的时区 ID（回显）
     * @param unknownSourceCommutes 计入统计但来源不可验证（非 {@code REAL}，含历史数据）的通勤次数
     * @param excludedDemoCommutes  因来源为演示而被排除的通勤次数
     * @param deduplicatedCommutes  读侧折叠掉的重复写入条数（不增加趋势次数）
     * @param outOfWindowCommutes   完成时间落在窗口自然日之外（含未来时间）而未计入的次数
     */
    public record TrendResult(
            List<TrendPoint> points,
            String recommendation,
            int totalCommutes,
            TrendSummary summary,
            int days,
            String timezone,
            int unknownSourceCommutes,
            int excludedDemoCommutes,
            int deduplicatedCommutes,
            int outOfWindowCommutes
    ) {
    }
}
