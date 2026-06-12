package com.example.commutemood.domain;

import java.time.Instant;
import java.util.UUID;

public record RouteQueryHistory(
        UUID id,
        GeoPoint origin,
        GeoPoint destination,
        RouteComparison result,
        Instant createdAt
) {
}
