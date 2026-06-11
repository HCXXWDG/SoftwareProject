package com.example.commutemood.domain;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Aggregated heatmap cell for map rendering")
public record HeatmapCell(
        @Schema(description = "Stable cell identifier", example = "z16-116398-39908")
        String cellId,
        @Schema(description = "Cell center coordinate")
        GeoPoint center,
        @Schema(description = "Aggregated stress score", example = "62.5")
        double score,
        @Schema(description = "Confidence based on sample count", example = "0.78")
        double confidence,
        @Schema(description = "Number of reports in this cell", example = "12")
        int count,
        @Schema(description = "Most frequent mood tag in this cell")
        EmotionTag dominantTag
) {
}
