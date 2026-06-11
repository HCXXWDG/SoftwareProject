package com.example.commutemood.domain;

import java.util.List;

public record RouteCandidate(
        String id,
        String label,
        int distanceMeters,
        int durationSeconds,
        List<GeoPoint> polyline,
        Double demoStressExposure
) {
    public RouteCandidate(
            String id,
            String label,
            int distanceMeters,
            int durationSeconds,
            List<GeoPoint> polyline
    ) {
        this(id, label, distanceMeters, durationSeconds, polyline, null);
    }
}

