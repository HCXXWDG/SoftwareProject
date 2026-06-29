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

        List<GeoPoint> fastest = List.of(
                origin,
                new GeoPoint(origin.longitude() + dx * 0.35 + dy * 0.08,
                        origin.latitude() + dy * 0.35 - dx * 0.06),
                new GeoPoint(origin.longitude() + dx * 0.70 + dy * 0.05,
                        origin.latitude() + dy * 0.70 - dx * 0.04),
                destination);
        List<GeoPoint> calmer = List.of(
                origin,
                new GeoPoint(origin.longitude() + dx * 0.30 - dy * 0.12,
                        origin.latitude() + dy * 0.30 + dx * 0.10),
                new GeoPoint(origin.longitude() + dx * 0.65 - dy * 0.08,
                        origin.latitude() + dy * 0.65 + dx * 0.06),
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
                new RouteCandidate("route-fast", "最快路线 A", baseDistance, baseDuration, fastest, 68.0),
                new RouteCandidate("route-calm", "少心累路线 B",
                        (int) polylineDistance(calmer), baseDuration + 12, calmer, 28.0),
                new RouteCandidate("route-scenic", "备选路线 C",
                        (int) polylineDistance(scenic), (int) (baseDuration * 1.28), scenic, null));
    }

    private double polylineDistance(List<GeoPoint> points) {
        double result = 0;
        for (int index = 1; index < points.size(); index++) {
            result += GeoMath.distanceMeters(points.get(index - 1), points.get(index));
        }
        return result;
    }
}
