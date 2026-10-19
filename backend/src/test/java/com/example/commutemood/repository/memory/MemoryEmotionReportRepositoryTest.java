package com.example.commutemood.repository.memory;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.repository.ReportScope;
import com.example.commutemood.repository.SaveOutcome;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class MemoryEmotionReportRepositoryTest {

    private static final GeoBounds BOUNDS = new GeoBounds(120.260, 31.470, 120.280, 31.490);
    private static final Instant NOW = Instant.parse("2026-10-19T00:00:00Z");

    private MemoryEmotionReportRepository repository;

    @BeforeEach
    void setUp() {
        repository = new MemoryEmotionReportRepository();
        // 真实反馈：噪音
        repository.save(report("device-real-1", 120.2700, 31.4800, 75, EmotionTag.NOISE, NOW, false));
        // 真实反馈：新正向标签（树荫）
        repository.save(report("device-real-2", 120.2710, 31.4810, 25, EmotionTag.SHADE, NOW.minus(1, ChronoUnit.HOURS), false));
        // 演示种子数据
        repository.save(report("simulated-device-1", 120.2720, 31.4820, 50, EmotionTag.QUIET, NOW.minus(2, ChronoUnit.HOURS), true));
        // 范围外
        repository.save(report("device-outside", 121.0000, 31.4800, 50, EmotionTag.OTHER, NOW, false));
        // 时间窗外
        repository.save(report("device-old", 120.2700, 31.4800, 50, EmotionTag.OTHER, NOW.minus(10, ChronoUnit.DAYS), false));
    }

    @Test
    void realOnlyScopeExcludesSimulatedSeedData() {
        List<EmotionReport> result = repository.findWithin(BOUNDS, NOW.minus(7, ChronoUnit.DAYS), ReportScope.REAL_ONLY);

        assertThat(result).hasSize(2)
                .allSatisfy(report -> assertThat(report.simulated()).isFalse())
                .extracting(EmotionReport::deviceHash)
                .containsExactlyInAnyOrder("device-real-1", "device-real-2");
    }

    @Test
    void simulatedOnlyScopeReturnsSeedDataOnly() {
        List<EmotionReport> result = repository.findWithin(BOUNDS, NOW.minus(7, ChronoUnit.DAYS), ReportScope.SIMULATED_ONLY);

        assertThat(result).hasSize(1)
                .allSatisfy(report -> assertThat(report.simulated()).isTrue())
                .first()
                .extracting(EmotionReport::tag)
                .isEqualTo(EmotionTag.QUIET);
    }

    @Test
    void allScopeKeepsDemoHeatmapWorking() {
        List<EmotionReport> result = repository.findWithin(BOUNDS, NOW.minus(7, ChronoUnit.DAYS), ReportScope.ALL);

        assertThat(result).hasSize(3);
    }

    @Test
    void legacyTwoArgumentQueryMatchesAllScope() {
        List<EmotionReport> legacy = repository.findWithin(BOUNDS, NOW.minus(7, ChronoUnit.DAYS));
        List<EmotionReport> explicit = repository.findWithin(BOUNDS, NOW.minus(7, ChronoUnit.DAYS), ReportScope.ALL);

        assertThat(legacy).hasSameElementsAs(explicit);
    }

    @Test
    void nullScopeFallsBackToAllInsteadOfThrowing() {
        List<EmotionReport> result = repository.findWithin(BOUNDS, NOW.minus(7, ChronoUnit.DAYS), null);

        assertThat(result).hasSize(3);
    }

    @Test
    void scopeFilterStillRespectsTimeAndBounds() {
        // 时间下界收紧到 1 小时前，只剩真实 2 条与模拟 1 条中的 2 条
        List<EmotionReport> realOnly = repository.findWithin(BOUNDS, NOW.minus(90, ChronoUnit.MINUTES), ReportScope.REAL_ONLY);
        assertThat(realOnly).extracting(EmotionReport::deviceHash).containsExactly("device-real-1", "device-real-2");

        // 边界框缩小后模拟数据被排除
        GeoBounds narrow = new GeoBounds(120.260, 31.470, 120.2715, 31.490);
        assertThat(repository.findWithin(narrow, NOW.minus(7, ChronoUnit.DAYS), ReportScope.SIMULATED_ONLY)).isEmpty();
    }

    @Test
    void acceptsNewPositiveTags() {
        SaveOutcome outcome = repository.save(
                report("device-real-3", 120.2730, 31.4830, 0, EmotionTag.OPEN, NOW, false));

        assertThat(outcome).isEqualTo(SaveOutcome.CREATED);
        assertThat(repository.findWithin(BOUNDS, NOW.minus(7, ChronoUnit.DAYS), ReportScope.REAL_ONLY))
                .extracting(EmotionReport::tag)
                .contains(EmotionTag.OPEN, EmotionTag.SHADE);
    }

    @Test
    void duplicateDetectionIgnoresScopeBecauseItIsWriteSide() {
        SaveOutcome outcome = repository.save(
                report("device-real-1", 120.2700, 31.4800, 75, EmotionTag.NOISE, NOW.plus(1, ChronoUnit.MINUTES), false));

        assertThat(outcome).isEqualTo(SaveOutcome.DUPLICATE);
    }

    private EmotionReport report(
            String deviceHash,
            double longitude,
            double latitude,
            int stressLevel,
            EmotionTag tag,
            Instant reportedAt,
            boolean simulated
    ) {
        return new EmotionReport(
                UUID.randomUUID(),
                deviceHash,
                new GeoPoint(longitude, latitude),
                stressLevel,
                tag,
                reportedAt,
                simulated);
    }
}
