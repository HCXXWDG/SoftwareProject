package com.example.commutemood.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

public record CommuteCompleteRequest(
        @NotBlank String routeId,
        @NotBlank String routeLabel,
        @NotNull Integer endStressLevel,
        @NotNull @Min(1) @Max(600) Integer durationMinutes,
        @NotNull @Min(0) @Max(100) Double selectedScore,
        @NotNull @Min(0) @Max(100) Double fastestScore,
        String alternativeLabel,
        @Min(0) @Max(100) Double alternativeScore,
        @Min(1) Double alternativeDurationRatio,
        @NotNull @Min(0) @Max(1) Double confidence,
        Instant completedAt
) {
}

