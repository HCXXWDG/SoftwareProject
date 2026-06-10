package com.example.commutemood.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record RouteCompareRequest(
        @Valid @NotNull PointRequest origin,
        @Valid @NotNull PointRequest destination
) {
}

