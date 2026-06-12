package com.example.commutemood.application;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.repository.CommuteRecordRepository;
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

    public record TrendPoint(LocalDate date, Double averageStress, int commuteCount) {
    }

    public record TrendSummary(
            Double averageStress,
            Double stressDelta,
            String direction,
            boolean sampleSufficient
    ) {
    }

    public record TrendResult(
            List<TrendPoint> points,
            String recommendation,
            int totalCommutes,
            TrendSummary summary
    ) {
    }
}

