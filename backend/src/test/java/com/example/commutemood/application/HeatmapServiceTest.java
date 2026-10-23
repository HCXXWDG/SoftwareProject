package com.example.commutemood.application;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.HeatmapCell;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.HeatmapCellRepository;
import com.example.commutemood.repository.ReportScope;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HeatmapServiceTest {
    @ParameterizedTest
    @ValueSource(ints = {0, 100})
    void showsObservedExtremesWithoutPretendingThatOneReportIsHighConfidence(int stress) {
        for (ReportScope scope : List.of(ReportScope.REAL_ONLY, ReportScope.SIMULATED_ONLY)) {
            EmotionReportRepository repository = mock(EmotionReportRepository.class);
            when(repository.findWithin(any(), any(), eq(scope))).thenReturn(List.of(
                    new EmotionReport(
                            UUID.randomUUID(),
                            "device",
                            new GeoPoint(116.4, 39.9),
                            stress,
                            EmotionTag.NOISE,
                            Instant.now(),
                            scope == ReportScope.SIMULATED_ONLY)));

            HeatmapService service = new HeatmapService(repository, mock(HeatmapCellRepository.class));
            List<HeatmapCell> cells = service.getHeatmap(
                    new GeoBounds(116.39, 39.89, 116.41, 39.91), 16, 24, scope);

            assertThat(cells).hasSize(1);
            assertThat(cells.get(0).score()).isEqualTo(stress);
            assertThat(cells.get(0).confidence()).isBetween(0.18, 0.19);
            assertThat(cells.get(0).count()).isEqualTo(1);
            assertThat(cells.get(0).feedbackSource()).isEqualTo(scope == ReportScope.REAL_ONLY
                    ? com.example.commutemood.domain.FeedbackSource.REAL
                    : com.example.commutemood.domain.FeedbackSource.DEMO);
        }
    }

    @Test
    void showsTimeWeightedObservationAverageWithoutArtificialNeutralSamples() {
        EmotionReportRepository repository = mock(EmotionReportRepository.class);
        GeoPoint location = new GeoPoint(116.4, 39.9);
        Instant now = Instant.now();
        when(repository.findWithin(any(), any(), eq(ReportScope.REAL_ONLY))).thenReturn(List.of(
                new EmotionReport(UUID.randomUUID(), "recent", location, 0, EmotionTag.QUIET, now, false),
                new EmotionReport(UUID.randomUUID(), "older", location, 100, EmotionTag.NOISE,
                        now.minusSeconds(72 * 3600), false)));
        var service = new HeatmapService(repository, mock(HeatmapCellRepository.class));
        var cell = service.getHeatmap(new GeoBounds(116.39, 39.89, 116.41, 39.91), 16, 168).get(0);

        assertThat(cell.score()).isCloseTo(100 * Math.exp(-1) / (1 + Math.exp(-1)),
                org.assertj.core.data.Offset.offset(0.01));
        assertThat(cell.confidence()).isLessThan(0.3);
        assertThat(cell.count()).isEqualTo(2);
    }

    @Test
    void preservesPriorAndExistingRouteScoresWhenMapObservationColorChanges() {
        EmotionReportRepository repository = mock(EmotionReportRepository.class);
        Instant now = Instant.now();
        when(repository.findWithin(any(), any(), eq(ReportScope.REAL_ONLY))).thenReturn(
                IntStream.range(0, 10).mapToObj(index -> new EmotionReport(UUID.randomUUID(), "device-" + index,
                        new GeoPoint(116.4, 39.9), 100, EmotionTag.NOISE, now, false)).toList());
        var service = new HeatmapService(repository, mock(HeatmapCellRepository.class));
        var bounds = new GeoBounds(116.39, 39.89, 116.41, 39.91);
        var mapCell = service.getHeatmap(bounds, 16, 24).get(0);
        var routeCells = service.getRouteScoringCells(bounds, 16, 24, ReportScope.REAL_ONLY);
        var routeCell = routeCells.get(0);

        assertThat(mapCell.score()).isEqualTo(100);
        assertThat(routeCell.score()).isEqualTo(88.46); // Original (10 * 100 + 3 * 50) / 13.
        assertThat(routeCell.confidence()).isEqualTo(mapCell.confidence()).isEqualTo(0.86);
        assertThat(routeCell.count()).isEqualTo(mapCell.count());
        var center = routeCell.center();
        var route = new com.example.commutemood.domain.RouteCandidate("route", "步行", 20, 120,
                List.of(center, new GeoPoint(center.longitude(), center.latitude() + 0.0001)));
        var scored = new WeightedStressRouteScoringStrategy().score(route, 120, routeCells, true);
        assertThat(scored.scoringStatus()).isEqualTo(com.example.commutemood.domain.ScoringStatus.VALID);
        assertThat(scored.stressExposure()).isEqualTo(83.08); // Original confidence-to-neutral weighting.
        assertThat(scored.stressScore()).isEqualTo(62.31); // Original 75% exposure + 25% time penalty.
    }

    @Test
    void usesFinerGridAtHigherZoom() {
        assertThat(HeatmapService.gridSizeForZoom(17))
                .isLessThan(HeatmapService.gridSizeForZoom(15));
    }

    @Test
    void explicitScopeKeepsRealAndSimulatedEvidenceSeparateAndLabelsMixedCells() {
        var repository = new com.example.commutemood.repository.memory.MemoryEmotionReportRepository();
        GeoPoint point = new GeoPoint(120.27, 31.48);
        Instant now = Instant.now();
        repository.save(new EmotionReport(UUID.randomUUID(), "real", point, 0, EmotionTag.QUIET, now, false));
        repository.save(new EmotionReport(UUID.randomUUID(), "demo", point, 100, EmotionTag.NOISE, now, true));
        var service = new HeatmapService(repository, mock(HeatmapCellRepository.class));
        var bounds = new GeoBounds(120.26, 31.47, 120.28, 31.49);
        var real = service.getHeatmap(bounds, 16, 24).get(0);
        assertThat(real.count()).isEqualTo(1);
        assertThat(real.feedbackSource()).isEqualTo(com.example.commutemood.domain.FeedbackSource.REAL);
        assertThat(real.updatedAt()).isEqualTo(now);
        assertThat(real.windowHours()).isEqualTo(24);
        var demo = service.getHeatmap(bounds, 16, 24, ReportScope.SIMULATED_ONLY).get(0);
        assertThat(demo.feedbackSource()).isEqualTo(com.example.commutemood.domain.FeedbackSource.DEMO);
        var mixed = service.getHeatmap(bounds, 16, 24, ReportScope.ALL).get(0);
        assertThat(mixed.count()).isEqualTo(2);
        assertThat(mixed.feedbackSource()).isEqualTo(com.example.commutemood.domain.FeedbackSource.MIXED);
        assertThat(real.score()).isLessThan(mixed.score());
    }

    @Test
    void refreshPersistsComputedCells() {
        EmotionReportRepository reportRepository = mock(EmotionReportRepository.class);
        HeatmapCellRepository cellRepository = mock(HeatmapCellRepository.class);
        when(reportRepository.findWithin(any(), any(), eq(ReportScope.REAL_ONLY))).thenReturn(List.of(
                new EmotionReport(
                        UUID.randomUUID(),
                        "device",
                        new GeoPoint(116.4, 39.9),
                        75,
                        EmotionTag.CROWD,
                        Instant.now(),
                        false)));
        HeatmapService service = new HeatmapService(reportRepository, cellRepository);

        List<HeatmapCell> cells = service.refreshCachedHeatmap(
                new GeoBounds(116.39, 39.89, 116.41, 39.91), 16, 24);

        assertThat(cells).hasSize(1);
        verify(cellRepository).upsertAll(eq(16), eq(cells));
    }
}

