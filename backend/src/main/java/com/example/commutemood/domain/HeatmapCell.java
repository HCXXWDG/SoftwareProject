package com.example.commutemood.domain;

public record HeatmapCell(
        String cellId,
        GeoPoint center,
        double score,
        double confidence,
        int count,
        EmotionTag dominantTag
) {
}

