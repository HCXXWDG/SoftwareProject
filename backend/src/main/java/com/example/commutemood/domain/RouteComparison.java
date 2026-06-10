package com.example.commutemood.domain;

import java.util.List;

public record RouteComparison(
        List<ScoredRoute> routes,
        String fastestRouteId,
        String leastStressfulRouteId,
        String recommendation,
        boolean recommendAlternative
) {
}

