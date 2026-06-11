package com.example.commutemood.domain;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Route candidate with stress scoring metadata")
public record ScoredRoute(
        @Schema(description = "Route identifier", example = "route-fast")
        String id,
        @Schema(description = "Human-readable route label", example = "最快路线 A")
        String label,
        @Schema(description = "Route distance in meters", example = "4200")
        int distanceMeters,
        @Schema(description = "Estimated duration in seconds", example = "1080")
        int durationSeconds,
        @Schema(description = "Accumulated stress exposure along the route", example = "48.2")
        double stressExposure,
        @Schema(description = "Normalized stress score", example = "62.0")
        double stressScore,
        @Schema(description = "Confidence in the score", example = "0.72")
        double confidence,
        @Schema(description = "Whether this route is the fastest candidate")
        boolean fastest,
        @Schema(description = "Whether this route is the least stressful candidate")
        boolean leastStressful,
        @Schema(description = "Route polyline for map drawing")
        List<GeoPoint> polyline
) {
}
