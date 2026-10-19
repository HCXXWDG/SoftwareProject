package com.example.commutemood.repository.memory;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.ReportDeduplication;
import com.example.commutemood.repository.ReportScope;
import com.example.commutemood.repository.SaveOutcome;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Repository
@Profile("!postgres")
public class MemoryEmotionReportRepository implements EmotionReportRepository {
    private final CopyOnWriteArrayList<EmotionReport> reports = new CopyOnWriteArrayList<>();
    private final Object writeLock = new Object();

    @Override
    public SaveOutcome save(EmotionReport report) {
        // 去重是“先查再写”，必须串行化，否则并发提交会把同一次反馈计成多条
        synchronized (writeLock) {
            boolean duplicate = reports.stream()
                    .anyMatch(existing -> ReportDeduplication.isDuplicate(existing, report));
            if (duplicate) {
                return SaveOutcome.DUPLICATE;
            }
            reports.add(report);
            return SaveOutcome.CREATED;
        }
    }

    @Override
    public List<EmotionReport> findWithin(GeoBounds bounds, Instant since, ReportScope scope) {
        ReportScope effectiveScope = scope == null ? ReportScope.ALL : scope;
        return reports.stream()
                .filter(report -> !report.reportedAt().isBefore(since))
                .filter(report -> report.location().longitude() >= bounds.west())
                .filter(report -> report.location().longitude() <= bounds.east())
                .filter(report -> report.location().latitude() >= bounds.south())
                .filter(report -> report.location().latitude() <= bounds.north())
                .filter(report -> effectiveScope.matches(report.simulated()))
                .toList();
    }
}

