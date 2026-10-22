package com.example.commutemood.domain;

import com.example.commutemood.application.GeoMath;

public final class RouteCandidateValidator {
    private RouteCandidateValidator() { }

    public static boolean isValid(RouteCandidate route) {
        if (route == null || route.id() == null || route.id().isBlank()
                || route.label() == null || route.label().isBlank()
                || route.distanceMeters() <= 0 || route.durationSeconds() <= 0
                || route.polyline() == null || route.polyline().size() < 2
                || route.polyline().stream().anyMatch(point -> point == null)
                || (route.demoStressExposure() != null && (!Double.isFinite(route.demoStressExposure())
                || route.demoStressExposure() < 0 || route.demoStressExposure() > 100))) {
            return false;
        }
        return GeoMath.distanceMeters(route.polyline().get(0),
                route.polyline().get(route.polyline().size() - 1)) > 0;
    }
}
