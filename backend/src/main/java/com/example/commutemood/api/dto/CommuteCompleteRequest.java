package com.example.commutemood.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

@Schema(description = "Completed commute feedback for trend tracking")
public record CommuteCompleteRequest(
        @Schema(description = "Selected route identifier", example = "route-fast")
        @NotBlank String routeId,
        @Schema(description = "Human-readable route label", example = "最快路线 A")
        @NotBlank String routeLabel,
        @Schema(description = "End-of-trip stress level", example = "25", minimum = "0", maximum = "100")
        @NotNull Integer endStressLevel,
        @Schema(description = "Trip duration in minutes", example = "18", minimum = "1", maximum = "600")
        @NotNull @Min(1) @Max(600) Integer durationMinutes,
        @Schema(description = "Stress score of the selected route", example = "62", minimum = "0", maximum = "100")
        @NotNull @Min(0) @Max(100) Double selectedScore,
        @Schema(description = "Stress score of the fastest route", example = "62", minimum = "0", maximum = "100")
        @NotNull @Min(0) @Max(100) Double fastestScore,
        @Schema(description = "Alternative route label when one was shown", example = "少心累路线 B")
        String alternativeLabel,
        @Schema(description = "Alternative route stress score", example = "43", minimum = "0", maximum = "100")
        @Min(0) @Max(100) Double alternativeScore,
        @Schema(description = "Alternative route duration divided by fastest duration", example = "1.12", minimum = "1")
        @Min(1) Double alternativeDurationRatio,
        @Schema(description = "Confidence in route scoring", example = "0.72", minimum = "0", maximum = "1")
        @NotNull @Min(0) @Max(1) Double confidence,
        @Schema(description = "Completion timestamp; defaults to server time when omitted")
        Instant completedAt
) {
}
