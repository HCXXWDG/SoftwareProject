package com.example.commutemood.domain;

import java.util.List;
import java.util.UUID;

@io.swagger.v3.oas.annotations.media.Schema(description = "Source-aware walking comparison. snapshotId is returned only after successful device-owned persistence. DEMO snapshots and snapshots without VALID scoring can still complete a commute; they are recorded with routeSource/scoring metadata and excluded or left unscored on the read side, never rejected at write time and never padded with zero scores.")
public record RouteComparison(
        List<ScoredRoute> routes,
        String fastestRouteId,
        String leastStressfulRouteId,
        String recommendation,
        boolean recommendAlternative,
        RouteSource routeSource,
        FeedbackSource feedbackSource,
        ScoringStatus scoringStatus,
        RecommendationReason recommendationReason,
        String scoringVersion,
        String travelMode,
        UUID snapshotId,
        RecommendationDetails recommendationDetails
) {
    public RouteComparison(List<ScoredRoute> routes, String fastestRouteId, String leastStressfulRouteId,
                           String recommendation, boolean recommendAlternative) {
        this(routes, fastestRouteId, leastStressfulRouteId, recommendation, recommendAlternative,
                RouteSource.UNKNOWN, FeedbackSource.UNKNOWN, ScoringStatus.UNAVAILABLE, null, null, "WALKING", null, null);
    }

    public RouteComparison {
        routeSource = routeSource == null ? RouteSource.UNKNOWN : routeSource;
        feedbackSource = feedbackSource == null ? FeedbackSource.UNKNOWN : feedbackSource;
        scoringStatus = scoringStatus == null ? ScoringStatus.UNAVAILABLE : scoringStatus;
        routes = routes == null ? List.of() : List.copyOf(routes);
    }

    public RouteComparison withSnapshotId(UUID id) {
        return new RouteComparison(routes, fastestRouteId, leastStressfulRouteId, recommendation,
                recommendAlternative, routeSource, feedbackSource, scoringStatus, recommendationReason,
                scoringVersion, travelMode, id, recommendationDetails);
    }
}

