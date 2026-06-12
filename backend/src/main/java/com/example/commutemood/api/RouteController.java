package com.example.commutemood.api;

import com.example.commutemood.api.dto.RouteCompareRequest;
import com.example.commutemood.application.RouteComparisonService;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/routes")
@Tag(name = "Routes", description = "Compare routes and read route-query history.")
public class RouteController {
    private final RouteComparisonService routeComparisonService;

    public RouteController(RouteComparisonService routeComparisonService) {
        this.routeComparisonService = routeComparisonService;
    }

    @PostMapping("/compare")
    @Operation(summary = "Compare candidate routes")
    public RouteComparison compare(
            @RequestHeader(value = "X-Device-Id", required = false) String deviceId,
            @Valid @RequestBody RouteCompareRequest request
    ) {
        return routeComparisonService.compare(
                deviceId,
                new GeoPoint(request.origin().longitude(), request.origin().latitude()),
                new GeoPoint(request.destination().longitude(), request.destination().latitude()));
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

