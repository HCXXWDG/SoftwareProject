package com.example.commutemood.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record RoutePolicy(boolean demoEnabled, double endpointToleranceMeters) {
    public RoutePolicy(@Value("${app.routing.demo-enabled:false}") boolean demoEnabled,
                       @Value("${app.routing.endpoint-tolerance-meters:150}") double endpointToleranceMeters) {
        if (!Double.isFinite(endpointToleranceMeters) || endpointToleranceMeters < 0
                || endpointToleranceMeters > 1000) {
            throw new IllegalArgumentException("Route endpoint tolerance must be between 0 and 1000 meters");
        }
        this.demoEnabled = demoEnabled;
        this.endpointToleranceMeters = endpointToleranceMeters;
    }
}
