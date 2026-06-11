package com.example.commutemood.external;

import com.example.commutemood.application.GeoMath;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteCandidate;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class MockRouteProvider implements RouteProvider {
    @Override
    public List<RouteCandidate> findCandidates(GeoPoint origin, GeoPoint destination) {
        double dx = destination.longitude() - origin.longitude();
        double dy = destination.latitude() - origin.latitude();
        GeoPoint midpoint = new GeoPoint(origin.longitude() + dx * 0.5, origin.latitude() + dy * 0.5);

        List<GeoPoint> fastest = List.of(
                origin,
                new GeoPoint(origin.longitude() + dx * 0.32, origin.latitude() + dy * 0.27),
                midpoint,
                new GeoPoint(origin.longitude() + dx * 0.72, origin.latitude() + dy * 0.77),
                destination);
        List<GeoPoint> calmer = List.of(
                origin,
                new GeoPoint(origin.longitude() + dx * 0.22 - dy * 0.18,
                        origin.latitude() + dy * 0.25 + dx * 0.12),
                new GeoPoint(origin.longitude() + dx * 0.50 - dy * 0.22,
                        origin.latitude() + dy * 0.55 + dx * 0.15),
                new GeoPoint(origin.longitude() + dx * 0.76 - dy * 0.14,
                        origin.latitude() + dy * 0.82 + dx * 0.08),
                destination);
        List<GeoPoint> scenic = List.of(
                origin,
                new GeoPoint(origin.longitude() + dx * 0.18 + dy * 0.12,
                        origin.latitude() + dy * 0.18 - dx * 0.09),
                new GeoPoint(origin.longitude() + dx * 0.58 + dy * 0.16,
                        origin.latitude() + dy * 0.42 - dx * 0.10),
                new GeoPoint(origin.longitude() + dx * 0.83 + dy * 0.06,
                        origin.latitude() + dy * 0.73 - dx * 0.04),
                destination);

        int baseDistance = (int) polylineDistance(fastest);
        int baseDuration = Math.max(240, (int) (baseDistance / 8.5));
        return List.of(
                new RouteCandidate("route-fast", "最快路线 A", baseDistance, baseDuration, fastest),
                new RouteCandidate("route-calm", "少心累路线 B",
                        (int) polylineDistance(calmer), (int) (baseDuration * 1.08), calmer),
                new RouteCandidate("route-scenic", "备选路线 C",
                        (int) polylineDistance(scenic), (int) (baseDuration * 1.28), scenic));
    }

    private double polylineDistance(List<GeoPoint> points) {
        double result = 0;
        for (int index = 1; index < points.size(); index++) {
            result += GeoMath.distanceMeters(points.get(index - 1), points.get(index));
        }
        return result;
    }
}

