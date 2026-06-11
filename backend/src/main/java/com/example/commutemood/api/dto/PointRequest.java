package com.example.commutemood.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

@Schema(description = "WGS84 geographic coordinate")
public record PointRequest(
        @Schema(description = "Longitude in degrees", example = "116.398", minimum = "-180", maximum = "180")
        @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
        @Schema(description = "Latitude in degrees", example = "39.908", minimum = "-90", maximum = "90")
        @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude
) {
}
