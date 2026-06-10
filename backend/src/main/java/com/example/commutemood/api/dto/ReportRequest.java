package com.example.commutemood.api.dto;

import com.example.commutemood.domain.EmotionTag;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

public record ReportRequest(
        @NotNull PointRequest location,
        @NotNull Integer stressLevel,
        @NotNull EmotionTag tag,
        Instant reportedAt
) {
}

