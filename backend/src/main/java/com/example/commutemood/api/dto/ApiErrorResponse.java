package com.example.commutemood.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Structured API error response")
public record ApiErrorResponse(
        @Schema(description = "Error timestamp in ISO-8601", example = "2026-06-10T08:30:00Z")
        String timestamp,
        @Schema(description = "HTTP status code", example = "400")
        int status,
        @Schema(description = "Machine-readable error code", example = "invalid_request")
        String code,
        @Schema(description = "Human-readable error message")
        String message
) {
}
