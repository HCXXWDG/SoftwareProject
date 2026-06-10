package com.example.commutemood.domain;

import java.util.List;

public record ScoredRoute(
        String id,
        String label,
        int distanceMeters,
        int durationSeconds,
        double stressExposure,
        double stressScore,
        double confidence,
        boolean fastest,
        boolean leastStressful,
        List<GeoPoint> polyline
) {
}

