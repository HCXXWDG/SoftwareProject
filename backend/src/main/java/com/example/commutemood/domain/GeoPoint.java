package com.example.commutemood.domain;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "WGS84 geographic coordinate")
public record GeoPoint(
        @Schema(description = "Longitude in degrees", example = "116.398")
        double longitude,
        @Schema(description = "Latitude in degrees", example = "39.908")
        double latitude
) {
    public GeoPoint {
        if (!Double.isFinite(longitude) || !Double.isFinite(latitude)
                || longitude < -180 || longitude > 180
                || latitude < -90 || latitude > 90) {
            throw new IllegalArgumentException("Invalid longitude or latitude");
        }
    }
}
