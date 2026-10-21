package com.example.commutemood.application;

import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.HeatmapCell;
import com.example.commutemood.domain.RouteCandidate;
import com.example.commutemood.domain.ScoredRoute;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class WeightedStressRouteScoringStrategyTest {
    private final WeightedStressRouteScoringStrategy strategy =
            new WeightedStressRouteScoringStrategy();

    @Test
    void demoExposureIsNeverPresentedAsARealScore() {
        RouteCandidate route = new RouteCandidate(
                "route-calm", "Calm", 1000, 660,
                List.of(new GeoPoint(116.4, 39.9), new GeoPoint(116.405, 39.905)),
                28.0);

        ScoredRoute scored = strategy.score(route, 600, List.of(), false);

        assertThat(scored.stressExposure()).isNull();
        assertThat(scored.stressScore()).isNull();
        assertThat(scored.scoringStatus()).isEqualTo(com.example.commutemood.domain.ScoringStatus.UNAVAILABLE);
    }

    @Test
    void lowerStressCanBeatSmallTimePenalty() {
        RouteCandidate route = new RouteCandidate(
                "calm", "Calm", 1000, 660,
                List.of(new GeoPoint(116.4, 39.9), new GeoPoint(116.405, 39.905)));
        HeatmapCell calmCell = new HeatmapCell(
                "cell", new GeoPoint(116.4025, 39.9025),
                20, 1, 20, EmotionTag.OTHER);

        List<HeatmapCell> coverage = GeoMath.sampleEvery(route.polyline(), 50).stream()
                .map(point -> new HeatmapCell("cell", point, 20, 1, 20, EmotionTag.OTHER)).toList();
        ScoredRoute scored = strategy.score(route, 600, coverage, false);

        assertThat(scored.stressScore()).isLessThan(50);
        assertThat(scored.fastest()).isFalse();
    }

    @Test
    void missingDataIsNotAValidNeutralOrZeroScore() {
        RouteCandidate route = new RouteCandidate(
                "fast", "Fast", 1000, 600,
                List.of(new GeoPoint(116.4, 39.9), new GeoPoint(116.405, 39.905)));

        ScoredRoute scored = strategy.score(route, 600, List.of(), true);

        assertThat(scored.stressExposure()).isNull();
        assertThat(scored.stressScore()).isNull();
        assertThat(scored.confidence()).isZero();
    }

    @Test
    void geometricallyEquivalentRoutesScoreWithinPointOneAndZeroCanBeValid() {
        List<GeoPoint> sparse = List.of(new GeoPoint(120, 31), new GeoPoint(120.01, 31));
        List<GeoPoint> dense = new java.util.ArrayList<>();
        for (int i = 0; i <= 100; i++) dense.add(new GeoPoint(120 + 0.0001 * i, 31));
        List<HeatmapCell> cells = GeoMath.sampleEvery(sparse, 50).stream()
                .map(point -> new HeatmapCell("cell", point, point.longitude() > 120.005 ? 80 : 10,
                        1, 10, EmotionTag.OTHER)).toList();
        var first = strategy.score(new RouteCandidate("a", "a", 1000, 600, sparse), 600, cells, true);
        var second = strategy.score(new RouteCandidate("b", "b", 1000, 600, dense), 600, cells, true);
        assertThat(second.stressExposure()).isCloseTo(first.stressExposure(), org.assertj.core.data.Offset.offset(0.1));
        assertThat(second.stressScore()).isCloseTo(first.stressScore(), org.assertj.core.data.Offset.offset(0.1));
        var zeros = cells.stream().map(cell -> new HeatmapCell(cell.cellId(), cell.center(), 0, 1, 10, EmotionTag.QUIET)).toList();
        assertThat(strategy.score(new RouteCandidate("a", "a", 1000, 600, sparse), 600, zeros, true).stressScore()).isZero();
    }

    @Test
    void invalidDurationsAndDegenerateRoutesCannotEnterDivision() {
        var route = new RouteCandidate("a", "a", 100, 60,
                List.of(new GeoPoint(120, 31), new GeoPoint(120.001, 31)));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> strategy.score(route, 0, List.of(), true))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void nonFiniteOrOutOfRangeCellValuesCannotPoisonScores() {
        var start = new GeoPoint(120, 31);
        var route = new RouteCandidate("a", "a", 50, 40, List.of(start, new GeoPoint(120.0004, 31)));
        var invalid = List.of(
                new HeatmapCell("nan", start, Double.NaN, 1, 10, EmotionTag.OTHER),
                new HeatmapCell("infinity", start, 50, Double.POSITIVE_INFINITY, 10, EmotionTag.OTHER),
                new HeatmapCell("range", start, 101, 1, 10, EmotionTag.OTHER));
        var result = strategy.score(route, 40, invalid, true);
        assertThat(result.stressScore()).isNull();
        assertThat(result.confidence()).isFinite().isZero();
    }
}

