package com.example.commutemood.repository.memory;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.SaveOutcome;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Repository
@Profile("!postgres")
public class MemoryEmotionReportRepository implements EmotionReportRepository {
    private final CopyOnWriteArrayList<EmotionReport> reports = new CopyOnWriteArrayList<>();

    @Override
    public SaveOutcome save(EmotionReport report) {
        boolean duplicate = reports.stream().anyMatch(existing ->
                existing.deviceHash().equals(report.deviceHash())
                        && Duration.between(existing.reportedAt(), report.reportedAt()).abs().toMinutes() < 5
                        && Math.abs(existing.location().longitude() - report.location().longitude()) < 0.0002
                        && Math.abs(existing.location().latitude() - report.location().latitude()) < 0.0002);
        if (duplicate) {
            return SaveOutcome.DUPLICATE;
        }
        reports.add(report);
        return SaveOutcome.CREATED;
    }

    @Override
    public List<EmotionReport> findWithin(GeoBounds bounds, Instant since) {
        return reports.stream()
                .filter(report -> !report.reportedAt().isBefore(since))
                .filter(report -> report.location().longitude() >= bounds.west())
                .filter(report -> report.location().longitude() <= bounds.east())
                .filter(report -> report.location().latitude() >= bounds.south())
                .filter(report -> report.location().latitude() <= bounds.north())
                .toList();
    }
}

