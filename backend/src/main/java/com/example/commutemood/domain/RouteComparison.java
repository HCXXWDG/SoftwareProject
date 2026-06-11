package com.example.commutemood.domain;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Route comparison result with recommendation")
public record RouteComparison(
        @Schema(description = "Scored route candidates")
        List<ScoredRoute> routes,
        @Schema(description = "Fastest route identifier", example = "route-fast")
        String fastestRouteId,
        @Schema(description = "Least stressful route identifier", example = "route-calm")
        String leastStressfulRouteId,
        @Schema(description = "Human-readable recommendation for the next commute")
        String recommendation,
        @Schema(description = "Whether the alternative route should be preferred")
        boolean recommendAlternative
) {
}
