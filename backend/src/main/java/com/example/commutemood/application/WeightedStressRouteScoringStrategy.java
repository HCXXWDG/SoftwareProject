package com.example.commutemood.application;

import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.HeatmapCell;
import com.example.commutemood.domain.RouteCandidate;
import com.example.commutemood.domain.ScoredRoute;
import com.example.commutemood.domain.ScoringStatus;
import com.example.commutemood.domain.RouteCandidateValidator;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class WeightedStressRouteScoringStrategy implements RouteScoringStrategy {
    private static final double MATCH_RADIUS_METERS = 80.0;
    public static final String VERSION = "walking-distance-v2";
    public static final double MIN_CONFIDENCE = 0.35;

    @Override
    public ScoredRoute score(
            RouteCandidate route,
            int fastestDurationSeconds,
            List<HeatmapCell> cells,
            boolean fastest
    ) {
        if (!RouteCandidateValidator.isValid(route) || fastestDurationSeconds <= 0 || cells == null) {
            throw new IllegalArgumentException("Scoring requires a valid route and positive fastest duration");
        }
        List<GeoPoint> samples = GeoMath.sampleEvery(route.polyline(), 50.0);
        double exposure;
        double confidence;
        if (route.demoStressExposure() != null) {
            return new ScoredRoute(route.id(), route.label(), route.distanceMeters(), route.durationSeconds(),
                    null, null, 0, fastest, false, route.polyline(), ScoringStatus.UNAVAILABLE);
        } else {
            double weightedStress = 0;
            double totalConfidence = 0;
            for (GeoPoint sample : samples) {
                HeatmapCell nearest = nearestCell(sample, cells);
                if (nearest == null) {
                    weightedStress += 50;
                } else {
                    double cellConfidence = nearest.confidence();
                    weightedStress += nearest.score() * cellConfidence + 50 * (1 - cellConfidence);
                    totalConfidence += cellConfidence;
                }
            }
            exposure = samples.isEmpty() ? 50 : weightedStress / samples.size();
            confidence = samples.isEmpty() ? 0 : totalConfidence / samples.size();
        }
        double relativeDelay = Math.max(0,
                (route.durationSeconds() - fastestDurationSeconds) / (fastestDurationSeconds * 0.20));
        double timePenalty = Math.min(100, relativeDelay * 100);
        double score = exposure * 0.75 + timePenalty * 0.25;
        ScoringStatus status = confidence >= MIN_CONFIDENCE
                ? ScoringStatus.VALID : ScoringStatus.INSUFFICIENT_DATA;
        return new ScoredRoute(
                route.id(),
                route.label(),
                route.distanceMeters(),
                route.durationSeconds(),
                status == ScoringStatus.VALID ? round(exposure) : null,
                status == ScoringStatus.VALID ? round(score) : null,
                round(confidence),
                fastest,
                false,
                route.polyline(), status);
    }

    private HeatmapCell nearestCell(GeoPoint sample, List<HeatmapCell> cells) {
        HeatmapCell nearest = null;
        double nearestDistance = Double.POSITIVE_INFINITY;
        for (HeatmapCell cell : cells) {
            if (cell == null || cell.center() == null || cell.count() <= 0
                    || !Double.isFinite(cell.score()) || !Double.isFinite(cell.confidence())
                    || cell.score() < 0 || cell.score() > 100
                    || cell.confidence() < 0 || cell.confidence() > 1) {
                continue;
            }
            double distance = GeoMath.distanceMeters(sample, cell.center());
            if (distance <= MATCH_RADIUS_METERS && distance < nearestDistance) {
                nearest = cell;
                nearestDistance = distance;
            }
        }
        return nearest;
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}

