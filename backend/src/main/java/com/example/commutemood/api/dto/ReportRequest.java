package com.example.commutemood.api.dto;

import com.example.commutemood.domain.EmotionTag;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

@Schema(description = "Mood report submitted from the map")
public record ReportRequest(
        @Schema(description = "Report location on the map")
        @NotNull PointRequest location,
        @Schema(description = "Self-reported stress level", example = "75", minimum = "0", maximum = "100")
        @NotNull Integer stressLevel,
        @Schema(description = "Primary mood tag for this report")
        @NotNull EmotionTag tag,
        @Schema(description = "Client-side report timestamp; defaults to server time when omitted")
        Instant reportedAt
) {
}
