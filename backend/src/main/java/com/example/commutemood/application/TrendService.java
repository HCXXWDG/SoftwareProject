package com.example.commutemood.application;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.repository.CommuteRecordRepository;
import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TrendService {
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
        if (days < 1 || days > 30) {
            throw new IllegalArgumentException("days must be between 1 and 30");
        }
        String deviceHash = identityService.hash(rawDeviceId);
        Instant since = Instant.now().minus(days, ChronoUnit.DAYS);
        List<CommuteRecord> records = repository.findByDeviceSince(deviceHash, since);

        Map<LocalDate, List<CommuteRecord>> byDay = new LinkedHashMap<>();
        LocalDate today = LocalDate.now(zoneId);
        for (int offset = days - 1; offset >= 0; offset--) {
            byDay.put(today.minusDays(offset), new ArrayList<>());
        }
        for (CommuteRecord record : records) {
            LocalDate date = record.completedAt().atZone(zoneId).toLocalDate();
            byDay.computeIfAbsent(date, ignored -> new ArrayList<>()).add(record);
        }

        List<TrendPoint> points = byDay.entrySet().stream()
                .map(entry -> {
                    List<CommuteRecord> dayRecords = entry.getValue();
                    Double average = dayRecords.isEmpty() ? null : round(dayRecords.stream()
                            .mapToInt(CommuteRecord::endStressLevel)
                            .average()
                            .orElse(0));
                    return new TrendPoint(entry.getKey(), average, dayRecords.size());
                })
                .toList();

        TrendSummary summary = buildSummary(records);
        String recommendation = buildRecommendation(records);
        return new TrendResult(points, recommendation, records.size(), summary);
    }

    private String buildRecommendation(List<CommuteRecord> records) {
        if (records.isEmpty()) {
            return "完成一次通勤后，这里会给出次日路线建议。";
        }
        CommuteRecord latest = records.get(records.size() - 1);
        boolean recommendAlternative = latest.alternativeLabel() != null
                && latest.alternativeScore() != null
                && latest.alternativeDurationRatio() != null
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

    @Schema(description = "Daily commute trend point")
    public record TrendPoint(
            @Schema(description = "Calendar date in the requested timezone", example = "2026-06-10")
            LocalDate date,
            @Schema(description = "Average end-of-trip stress for the day")
            Double averageStress,
            @Schema(description = "Number of commutes completed on this day", example = "2")
            int commuteCount
    ) {
    }

    @Schema(description = "Aggregated commute trend summary")
    public record TrendSummary(
            @Schema(description = "Average end-of-trip stress across the window")
            Double averageStress,
            @Schema(description = "Recent average minus earlier average")
            Double stressDelta,
            @Schema(description = "Trend direction", allowableValues = {"improving", "worsening", "stable", "unknown"})
            String direction,
            @Schema(description = "Whether there is enough data for a reliable trend")
            boolean sampleSufficient
    ) {
    }

    @Schema(description = "Commute trend response")
    public record TrendResult(
            @Schema(description = "Daily trend points")
            List<TrendPoint> points,
            @Schema(description = "Recommendation for the next commute")
            String recommendation,
            @Schema(description = "Total commutes in the requested window", example = "7")
            int totalCommutes,
            @Schema(description = "Aggregated trend summary")
            TrendSummary summary
    ) {
    }
}

