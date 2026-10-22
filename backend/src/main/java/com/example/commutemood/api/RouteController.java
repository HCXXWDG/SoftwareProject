package com.example.commutemood.api;

import com.example.commutemood.api.dto.RouteCompareRequest;
import com.example.commutemood.application.RouteComparisonService;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;
import com.example.commutemood.domain.RecommendationReason;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/routes")
@Tag(name = "Routes", description = "Compare routes and read route-query history.")
public class RouteController {
    private final RouteComparisonService routeComparisonService;

    public RouteController(RouteComparisonService routeComparisonService) {
        this.routeComparisonService = routeComparisonService;
    }

    @PostMapping("/compare")
    @Operation(summary = "Compare validated walking routes", description = "Returns route/feedback sources, scoring status, recommendation reason and a device-owned snapshotId. Demo results cannot complete real commutes.")
    @ApiResponse(responseCode = "200", description = "Comparison result, including a genuine NO_ROUTE result",
            content = @Content(schema = @Schema(implementation = RouteComparison.class)))
    @ApiResponse(responseCode = "503", description = "Route provider unavailable; code is route_provider_unavailable")
    public ResponseEntity<?> compare(
            @RequestHeader(value = "X-Device-Id", required = false) String deviceId,
            @Valid @RequestBody RouteCompareRequest request
    ) {
        RouteComparison comparison = routeComparisonService.compare(
                deviceId,
                new GeoPoint(request.origin().longitude(), request.origin().latitude()),
                new GeoPoint(request.destination().longitude(), request.destination().latitude()), request.demo());
        if (comparison.recommendationReason() == RecommendationReason.SERVICE_UNAVAILABLE) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "timestamp", Instant.now().toString(),
                    "status", HttpStatus.SERVICE_UNAVAILABLE.value(),
                    "code", "route_provider_unavailable",
                    "message", comparison.recommendation()));
        }
        return ResponseEntity.ok(comparison);
    }

    @GetMapping("/history")
    @Operation(summary = "Get recent route comparisons")
    public List<RouteQueryHistory> history(
            @RequestHeader("X-Device-Id") String deviceId,
            @RequestParam(defaultValue = "10") int limit
    ) {
        return routeComparisonService.getHistory(deviceId, limit);
    }
}

