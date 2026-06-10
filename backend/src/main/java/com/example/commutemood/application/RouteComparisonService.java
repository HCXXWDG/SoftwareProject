package com.example.commutemood.application;

import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.HeatmapCell;
import com.example.commutemood.domain.RouteCandidate;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.ScoredRoute;
import com.example.commutemood.external.AmapRouteProvider;
import com.example.commutemood.external.MockRouteProvider;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class RouteComparisonService {
    private final AmapRouteProvider amapRouteProvider;
    private final MockRouteProvider mockRouteProvider;
    private final HeatmapService heatmapService;
    private final RouteScoringStrategy scoringStrategy;

    public RouteComparisonService(
            AmapRouteProvider amapRouteProvider,
            MockRouteProvider mockRouteProvider,
            HeatmapService heatmapService,
            RouteScoringStrategy scoringStrategy
    ) {
        this.amapRouteProvider = amapRouteProvider;
        this.mockRouteProvider = mockRouteProvider;
        this.heatmapService = heatmapService;
        this.scoringStrategy = scoringStrategy;
    }

    public RouteComparison compare(GeoPoint origin, GeoPoint destination) {
        List<RouteCandidate> candidates = getCandidates(origin, destination);
        int fastestDuration = candidates.stream()
                .mapToInt(RouteCandidate::durationSeconds)
                .min()
                .orElseThrow();
        List<RouteCandidate> eligible = candidates.stream()
                .filter(route -> route.durationSeconds() <= fastestDuration * 1.35)
                .limit(3)
                .toList();

        List<GeoPoint> allPoints = eligible.stream().flatMap(route -> route.polyline().stream()).toList();
        GeoBounds bounds = GeoBounds.around(allPoints, 0.001);
        List<HeatmapCell> cells = heatmapService.getHeatmap(bounds, 16, 168);

        List<ScoredRoute> scored = new ArrayList<>();
        for (RouteCandidate route : eligible) {
            scored.add(scoringStrategy.score(
                    route, fastestDuration, cells, route.durationSeconds() == fastestDuration));
        }

        ScoredRoute fastest = scored.stream()
                .min(Comparator.comparingInt(ScoredRoute::durationSeconds))
                .orElseThrow();
        ScoredRoute leastStressful = scored.stream()
                .min(Comparator.comparingDouble(ScoredRoute::stressScore))
                .orElseThrow();
        scored = scored.stream()
                .map(route -> route.id().equals(leastStressful.id())
                        ? new ScoredRoute(route.id(), route.label(), route.distanceMeters(),
                        route.durationSeconds(), route.stressExposure(), route.stressScore(),
                        route.confidence(), route.fastest(), true, route.polyline())
                        : route)
                .toList();

        double durationRatio = leastStressful.durationSeconds() / (double) fastest.durationSeconds();
        boolean recommend = !leastStressful.id().equals(fastest.id())
                && fastest.stressScore() - leastStressful.stressScore() >= 10
                && durationRatio <= 1.20
                && leastStressful.confidence() >= 0.35;
        String recommendation = recommend
                ? "明天试 " + leastStressful.label() + "：预计心累指数降低 "
                + Math.round(fastest.stressScore() - leastStressful.stressScore()) + " 分。"
                : "当前样本不足以稳定推荐绕行，建议先选择最快路线并继续反馈。";

        return new RouteComparison(
                scored,
                fastest.id(),
                leastStressful.id(),
                recommendation,
                recommend);
    }

    private List<RouteCandidate> getCandidates(GeoPoint origin, GeoPoint destination) {
        if (!amapRouteProvider.isConfigured()) {
            return mockRouteProvider.findCandidates(origin, destination);
        }
        try {
            return amapRouteProvider.findCandidates(origin, destination);
        } catch (RuntimeException ignored) {
            return mockRouteProvider.findCandidates(origin, destination);
        }
    }
}

