package com.example.commutemood.domain;

import java.util.List;

@io.swagger.v3.oas.annotations.media.Schema(description = "Walking candidate; stressExposure is environment experience, stressScore includes the time penalty. Null scores are unavailable, never zero placeholders.")
public record ScoredRoute(
        String id,
        String label,
        int distanceMeters,
        int durationSeconds,
        Double stressExposure,
        Double stressScore,
        double confidence,
        boolean fastest,
        boolean leastStressful,
        List<GeoPoint> polyline,
        ScoringStatus scoringStatus
) {
    public ScoredRoute(String id, String label, int distanceMeters, int durationSeconds,
                       double stressExposure, double stressScore, double confidence,
                       boolean fastest, boolean leastStressful, List<GeoPoint> polyline) {
        this(id, label, distanceMeters, durationSeconds, stressExposure, stressScore, confidence,
                fastest, leastStressful, polyline, ScoringStatus.VALID);
    }

    public ScoredRoute withState(boolean isFastest, boolean isLeastStressful, ScoringStatus status) {
        return new ScoredRoute(id, label, distanceMeters, durationSeconds,
                status == ScoringStatus.VALID ? stressExposure : null,
                status == ScoringStatus.VALID ? stressScore : null,
                status == ScoringStatus.UNAVAILABLE ? 0 : confidence,
                isFastest, isLeastStressful, polyline, status);
    }
}

