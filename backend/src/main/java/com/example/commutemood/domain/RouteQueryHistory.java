package com.example.commutemood.domain;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

@Schema(description = "Stored route comparison query and result")
public record RouteQueryHistory(
        @Schema(description = "History record identifier")
        UUID id,
        @Schema(description = "Trip origin")
        GeoPoint origin,
        @Schema(description = "Trip destination")
        GeoPoint destination,
        @Schema(description = "Route comparison result")
        RouteComparison result,
        @Schema(description = "Query timestamp")
        Instant createdAt
) {
}
