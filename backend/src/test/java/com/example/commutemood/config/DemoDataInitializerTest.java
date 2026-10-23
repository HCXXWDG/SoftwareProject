package com.example.commutemood.config;

import com.example.commutemood.application.DeviceIdentityService;
import com.example.commutemood.application.HeatmapService;
import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.FeedbackSource;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.domain.HeatmapCell;
import com.example.commutemood.repository.ReportScope;
import com.example.commutemood.repository.memory.MemoryCommuteRecordRepository;
import com.example.commutemood.repository.memory.MemoryEmotionReportRepository;
import com.example.commutemood.repository.memory.MemoryHeatmapCellRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;

import java.time.Instant;
import java.util.Arrays;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class DemoDataInitializerTest {
    private static final GeoBounds FORMER_CAMPUS =
            new GeoBounds(120.26067, 31.47278, 120.27946, 31.49417);
    private static final Set<EmotionTag> POSITIVE_TAGS =
            Set.of(EmotionTag.QUIET, EmotionTag.SHADE, EmotionTag.OPEN);

    private final MemoryEmotionReportRepository reports = new MemoryEmotionReportRepository();
    private final HeatmapService heatmap = new HeatmapService(reports, new MemoryHeatmapCellRepository());

    @BeforeEach
    void initializeCityDemo() {
        var identity = new DeviceIdentityService(new AppProperties(
                "demo-geography-test-salt", new AppProperties.Amap(""), ""));
        new DemoDataInitializer(reports, new MemoryCommuteRecordRepository(), identity)
                .run(new DefaultApplicationArguments());
    }

    @Test
    void cityDemoReplacesCampusSeedsWithoutCreatingRealEvidence() {
        var simulated = reports.findWithin(liangxiBounds(), Instant.EPOCH, ReportScope.SIMULATED_ONLY);

        assertThat(simulated).hasSize(500)
                .allSatisfy(report -> assertThat(report.simulated()).isTrue());
        assertThat(reports.findWithin(FORMER_CAMPUS, Instant.EPOCH, ReportScope.ALL)).isEmpty();
        assertThat(reports.findWithin(liangxiBounds(), Instant.EPOCH, ReportScope.REAL_ONLY)).isEmpty();
        assertThat(simulated).filteredOn(report -> POSITIVE_TAGS.contains(report.tag()))
                .isNotEmpty()
                .allSatisfy(report -> assertThat(report.stressLevel()).isLessThanOrEqualTo(25));
        assertThat(simulated).extracting(EmotionReport::tag).containsAll(Arrays.asList(EmotionTag.values()));
    }

    @Test
    void cityOverviewAndStreetZoomAggregateAllDemoReportsAndKeepTheirSource() {
        for (int zoom : new int[]{12, 16}) {
            var cells = heatmap.getHeatmap(liangxiBounds(), zoom, 168, ReportScope.SIMULATED_ONLY);

            assertThat(cells).isNotEmpty()
                    .allSatisfy(cell -> assertThat(cell.feedbackSource()).isEqualTo(FeedbackSource.DEMO));
            assertThat(cells.stream().mapToInt(HeatmapCell::count).sum()).isEqualTo(500);
            assertThat(heatmap.getHeatmap(liangxiBounds(), zoom, 168, ReportScope.REAL_ONLY)).isEmpty();
        }
    }

    private GeoBounds liangxiBounds() {
        double[] bounds = Arrays.stream(DemoGeography.HEATMAP_BBOX.split(","))
                .mapToDouble(Double::parseDouble).toArray();
        return new GeoBounds(bounds[0], bounds[1], bounds[2], bounds[3]);
    }
}
