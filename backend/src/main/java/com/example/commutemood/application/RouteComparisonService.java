package com.example.commutemood.application;

import com.example.commutemood.config.RoutePolicy;
import com.example.commutemood.domain.*;
import com.example.commutemood.external.AmapRouteProvider;
import com.example.commutemood.external.MockRouteProvider;
import com.example.commutemood.repository.ReportScope;
import com.example.commutemood.repository.RouteQueryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

@Service
public class RouteComparisonService {
    private final AmapRouteProvider amapRouteProvider;
    private final MockRouteProvider mockRouteProvider;
    private final HeatmapService heatmapService;
    private final RouteScoringStrategy scoringStrategy;
    private final DeviceIdentityService identityService;
    private final RouteQueryRepository routeQueryRepository;
    private final RoutePolicy policy;

    @Autowired
    public RouteComparisonService(AmapRouteProvider amapRouteProvider, MockRouteProvider mockRouteProvider,
            HeatmapService heatmapService, RouteScoringStrategy scoringStrategy,
            DeviceIdentityService identityService, RouteQueryRepository routeQueryRepository, RoutePolicy policy) {
        this.amapRouteProvider = amapRouteProvider;
        this.mockRouteProvider = mockRouteProvider;
        this.heatmapService = heatmapService;
        this.scoringStrategy = scoringStrategy;
        this.identityService = identityService;
        this.routeQueryRepository = routeQueryRepository;
        this.policy = policy;
    }

    public RouteComparisonService(AmapRouteProvider amapRouteProvider, MockRouteProvider mockRouteProvider,
            HeatmapService heatmapService, RouteScoringStrategy scoringStrategy,
            DeviceIdentityService identityService, RouteQueryRepository routeQueryRepository) {
        this(amapRouteProvider, mockRouteProvider, heatmapService, scoringStrategy,
                identityService, routeQueryRepository, new RoutePolicy(false, 150));
    }

    public RouteComparison compare(GeoPoint origin, GeoPoint destination) {
        return compare(null, origin, destination);
    }

    public RouteComparison compare(String rawDeviceId, GeoPoint origin, GeoPoint destination) {
        return compare(rawDeviceId, origin, destination, false);
    }

    public RouteComparison compare(String rawDeviceId, GeoPoint origin, GeoPoint destination, boolean demo) {
        if (origin == null || destination == null || GeoMath.distanceMeters(origin, destination) < 1) {
            throw new IllegalArgumentException("起终点至少需要相距 1 米。");
        }
        if (demo && !policy.demoEnabled()) {
            throw new IllegalArgumentException("当前部署未启用演示路线。");
        }
        RouteSource source = RouteSource.REAL;
        List<RouteCandidate> candidates;
        if (demo || !amapRouteProvider.isConfigured()) {
            if (!policy.demoEnabled()) return empty(RecommendationReason.SERVICE_UNAVAILABLE);
            source = RouteSource.DEMO;
            candidates = mockRouteProvider.findCandidates(origin, destination);
        } else {
            try {
                candidates = amapRouteProvider.findCandidates(origin, destination);
            } catch (RuntimeException failure) {
                // Real request failures remain visible; the user can explicitly request demo mode.
                return empty(RecommendationReason.SERVICE_UNAVAILABLE);
            }
        }

        var ids = new HashSet<String>();
        List<RouteCandidate> eligible = (candidates == null ? List.<RouteCandidate>of() : candidates).stream()
                .filter(RouteCandidateValidator::isValid)
                .filter(route -> endpointMatches(route, origin, destination))
                .sorted(Comparator.comparingInt(RouteCandidate::durationSeconds).thenComparing(RouteCandidate::id))
                .filter(route -> ids.add(route.id())).limit(3).toList();
        if (eligible.isEmpty()) return empty(RecommendationReason.NO_ROUTE);

        int fastestDuration = eligible.get(0).durationSeconds();
        GeoBounds bounds = GeoBounds.around(eligible.stream().flatMap(route -> route.polyline().stream()).toList(), 0.001);
        ReportScope scope = source == RouteSource.REAL ? ReportScope.REAL_ONLY : ReportScope.SIMULATED_ONLY;
        List<HeatmapCell> cells = heatmapService.getHeatmap(bounds, 16, 168, scope);
        FeedbackSource feedback = feedbackSource(cells);
        boolean realEvidence = source == RouteSource.REAL && feedback == FeedbackSource.REAL;
        ScoringStatus unavailableStatus = source == RouteSource.DEMO
                ? ScoringStatus.UNAVAILABLE : ScoringStatus.INSUFFICIENT_DATA;
        String fastestId = eligible.get(0).id();
        List<ScoredRoute> routes = eligible.stream().map(candidate -> {
            ScoredRoute scored = scoringStrategy.score(candidate, fastestDuration, cells, candidate.id().equals(fastestId));
            return realEvidence ? scored : scored.withState(candidate.id().equals(fastestId), false,
                    unavailableStatus);
        }).toList();
        ScoringStatus status = source == RouteSource.DEMO ? ScoringStatus.UNAVAILABLE
                : routes.stream().allMatch(route -> route.scoringStatus() == ScoringStatus.VALID)
                && realEvidence ? ScoringStatus.VALID : ScoringStatus.INSUFFICIENT_DATA;
        ScoredRoute fastest = routes.get(0);
        ScoredRoute calm = status == ScoringStatus.VALID ? routes.stream()
                .min(Comparator.comparingDouble((ScoredRoute route) -> route.stressScore())
                        .thenComparingInt(ScoredRoute::durationSeconds).thenComparing(ScoredRoute::id)).orElseThrow() : null;
        RecommendationReason reason = reason(source, status, routes, fastest, calm);
        boolean recommend = reason == RecommendationReason.RECOMMENDED;
        String calmId = calm == null ? null : calm.id();
        routes = routes.stream().map(route -> route.withState(route.id().equals(fastestId),
                calmId != null && route.id().equals(calmId), route.scoringStatus())).toList();
        RecommendationDetails details = calm == null ? null : new RecommendationDetails(
                calm.durationSeconds() - fastest.durationSeconds(),
                calm.durationSeconds() / (double) fastest.durationSeconds(),
                fastest.stressExposure() - calm.stressExposure(), fastest.stressScore() - calm.stressScore(),
                Math.min(calm.confidence(), fastest.confidence()));
        RouteComparison comparison = new RouteComparison(routes, fastestId, calmId, message(reason), recommend,
                source, feedback, status, reason, WeightedStressRouteScoringStrategy.VERSION, "WALKING", null, details);
        if (rawDeviceId == null || rawDeviceId.isBlank()) return comparison;
        UUID snapshotId = routeQueryRepository.save(identityService.hash(rawDeviceId), origin, destination, comparison);
        if (snapshotId == null) throw new IllegalStateException("Route snapshot was not saved");
        return comparison.withSnapshotId(snapshotId);
    }

    private boolean endpointMatches(RouteCandidate route, GeoPoint origin, GeoPoint destination) {
        return GeoMath.distanceMeters(route.polyline().get(0), origin) <= policy.endpointToleranceMeters()
                && GeoMath.distanceMeters(route.polyline().get(route.polyline().size() - 1), destination)
                <= policy.endpointToleranceMeters();
    }

    private static FeedbackSource feedbackSource(List<HeatmapCell> cells) {
        if (cells.isEmpty()) return FeedbackSource.NONE;
        if (cells.stream().allMatch(cell -> cell.feedbackSource() == FeedbackSource.REAL)) return FeedbackSource.REAL;
        if (cells.stream().allMatch(cell -> cell.feedbackSource() == FeedbackSource.DEMO)) return FeedbackSource.DEMO;
        return FeedbackSource.MIXED;
    }

    private static RecommendationReason reason(RouteSource source, ScoringStatus status,
            List<ScoredRoute> routes, ScoredRoute fastest, ScoredRoute calm) {
        if (source == RouteSource.DEMO) return RecommendationReason.DEMO_ONLY;
        if (routes.size() == 1) return RecommendationReason.NO_ALTERNATIVE;
        if (status != ScoringStatus.VALID) return RecommendationReason.INSUFFICIENT_DATA;
        if (calm.id().equals(fastest.id())) return RecommendationReason.SAME_ROUTE;
        if (calm.durationSeconds() / (double) fastest.durationSeconds() > 1.20) return RecommendationReason.DETOUR_TOO_LONG;
        if (fastest.stressScore() - calm.stressScore() < 10) return RecommendationReason.DIFFERENCE_TOO_SMALL;
        return RecommendationReason.RECOMMENDED;
    }

    private static RouteComparison empty(RecommendationReason reason) {
        return new RouteComparison(List.of(), null, null, message(reason), false, RouteSource.UNAVAILABLE,
                FeedbackSource.NONE, ScoringStatus.UNAVAILABLE, reason, WeightedStressRouteScoringStrategy.VERSION,
                "WALKING", null, null);
    }

    private static String message(RecommendationReason reason) {
        return switch (reason) {
            case RECOMMENDED -> "本次建议选择少心累路线，预计综合心累指数至少降低 10 分。";
            case NO_ROUTE -> "当前起终点没有可用的步行路线。";
            case SERVICE_UNAVAILABLE -> "步行路线服务暂不可用，请重试或明确选择演示模式。";
            case DEMO_ONLY -> "当前为演示步行路线，不提供真实评分，不计入真实通勤统计。";
            case INSUFFICIENT_DATA -> "真实反馈覆盖不足，暂不比较环境感受，建议先参考预计步行时间。";
            case NO_ALTERNATIVE -> "当前只有一条可用步行路线，没有可比较的替代路线。";
            case SAME_ROUTE -> "最快路线同时具有最低综合心累指数，本次无需绕行。";
            case DIFFERENCE_TOO_SMALL -> "替代路线的综合心累指数改善不足 10 分，本次优先最快路线。";
            case DETOUR_TOO_LONG -> "替代路线预计耗时增加超过 20%，本次不建议绕行。";
        };
    }

    public List<RouteQueryHistory> getHistory(String rawDeviceId, int limit) {
        if (limit < 1 || limit > 50) throw new IllegalArgumentException("limit must be between 1 and 50");
        return routeQueryRepository.findRecent(identityService.hash(rawDeviceId), limit);
    }
}
