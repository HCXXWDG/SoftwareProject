package com.example.commutemood.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

@Schema(description = "Route comparison request with origin and destination")
public record RouteCompareRequest(
        @Schema(description = "Trip origin")
        @Valid @NotNull PointRequest origin,
        @Schema(description = "Trip destination")
        @Valid @NotNull PointRequest destination
) {
}
