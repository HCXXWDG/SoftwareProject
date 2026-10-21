package com.example.commutemood.domain;

import java.time.Instant;

public record HeatmapCell(
        String cellId,
        GeoPoint center,
        double score,
        double confidence,
        int count,
        EmotionTag dominantTag,
        FeedbackSource feedbackSource,
        Instant updatedAt,
        Integer windowHours
) {
    public HeatmapCell(String cellId, GeoPoint center, double score, double confidence,
                       int count, EmotionTag dominantTag) {
        this(cellId, center, score, confidence, count, dominantTag, FeedbackSource.UNKNOWN, null, null);
    }
}

