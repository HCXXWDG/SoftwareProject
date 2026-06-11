package com.example.commutemood.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Mood report submission outcome")
public record ReportSubmissionResponse(
        @Schema(description = "Submission status", allowableValues = {"created", "duplicate"})
        String status,
        @Schema(description = "Outcome message for the client UI")
        String message
) {
}
