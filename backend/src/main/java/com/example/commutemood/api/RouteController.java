package com.example.commutemood.api;

import com.example.commutemood.api.dto.RouteCompareRequest;
import com.example.commutemood.application.RouteComparisonService;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/routes")
public class RouteController {
    private final RouteComparisonService routeComparisonService;

    public RouteController(RouteComparisonService routeComparisonService) {
        this.routeComparisonService = routeComparisonService;
    }

    @PostMapping("/compare")
    public RouteComparison compare(@Valid @RequestBody RouteCompareRequest request) {
        return routeComparisonService.compare(
                new GeoPoint(request.origin().longitude(), request.origin().latitude()),
                new GeoPoint(request.destination().longitude(), request.destination().latitude()));
    }
}

