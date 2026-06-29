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
    void usesDemoExposureOverrideWhenProvided() {
        RouteCandidate route = new RouteCandidate(
                "route-calm", "Calm", 1000, 660,
                List.of(new GeoPoint(116.4, 39.9), new GeoPoint(116.405, 39.905)),
                28.0);

        ScoredRoute scored = strategy.score(route, 600, List.of(), false);

        assertThat(scored.stressExposure()).isEqualTo(28.0);
        assertThat(scored.confidence()).isEqualTo(0.72);
    }

    @Test
    void lowerStressCanBeatSmallTimePenalty() {
        RouteCandidate route = new RouteCandidate(
                "calm", "Calm", 1000, 660,
                List.of(new GeoPoint(116.4, 39.9), new GeoPoint(116.405, 39.905)));
        HeatmapCell calmCell = new HeatmapCell(
                "cell", new GeoPoint(116.4025, 39.9025),
                20, 1, 20, EmotionTag.OTHER);

        ScoredRoute scored = strategy.score(route, 600, List.of(calmCell), false);

        assertThat(scored.stressScore()).isLessThan(50);
        assertThat(scored.fastest()).isFalse();
    }

    @Test
    void missingDataFallsBackToNeutralExposure() {
        RouteCandidate route = new RouteCandidate(
                "fast", "Fast", 1000, 600,
                List.of(new GeoPoint(116.4, 39.9), new GeoPoint(116.405, 39.905)));

        ScoredRoute scored = strategy.score(route, 600, List.of(), true);

        assertThat(scored.stressExposure()).isEqualTo(50);
        assertThat(scored.stressScore()).isEqualTo(37.5);
        assertThat(scored.confidence()).isZero();
    }
}

