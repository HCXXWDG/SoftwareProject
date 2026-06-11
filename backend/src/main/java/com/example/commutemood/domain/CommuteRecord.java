package com.example.commutemood.domain;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

@Schema(description = "Persisted commute completion record")
public record CommuteRecord(
        @Schema(description = "Record identifier")
        UUID id,
        @Schema(description = "Hashed anonymous device identifier")
        String deviceHash,
        @Schema(description = "Selected route identifier", example = "route-fast")
        String routeId,
        @Schema(description = "Human-readable route label")
        String routeLabel,
        @Schema(description = "End-of-trip stress level", example = "25")
        int endStressLevel,
        @Schema(description = "Trip duration in minutes", example = "18")
        int durationMinutes,
        @Schema(description = "Stress score of the selected route")
        double selectedScore,
        @Schema(description = "Stress score of the fastest route")
        double fastestScore,
        @Schema(description = "Alternative route label when one was shown")
        String alternativeLabel,
        @Schema(description = "Alternative route stress score")
        Double alternativeScore,
        @Schema(description = "Alternative route duration ratio")
        Double alternativeDurationRatio,
        @Schema(description = "Confidence in route scoring")
        double confidence,
        @Schema(description = "Completion timestamp")
        Instant completedAt
) {
}
