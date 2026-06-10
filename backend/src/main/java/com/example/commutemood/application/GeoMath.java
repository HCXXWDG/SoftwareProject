package com.example.commutemood.application;

import com.example.commutemood.domain.GeoPoint;

import java.util.ArrayList;
import java.util.List;

public final class GeoMath {
    private static final double EARTH_RADIUS_METERS = 6_371_000;

    private GeoMath() {
    }

    public static double distanceMeters(GeoPoint left, GeoPoint right) {
        double lat1 = Math.toRadians(left.latitude());
        double lat2 = Math.toRadians(right.latitude());
        double deltaLat = lat2 - lat1;
        double deltaLon = Math.toRadians(right.longitude() - left.longitude());
        double a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
                + Math.cos(lat1) * Math.cos(lat2)
                * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
        return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    public static List<GeoPoint> sampleEvery(List<GeoPoint> polyline, double spacingMeters) {
        if (polyline.size() < 2) {
            return List.copyOf(polyline);
        }
        List<GeoPoint> sampled = new ArrayList<>();
        sampled.add(polyline.get(0));
        for (int index = 1; index < polyline.size(); index++) {
            GeoPoint start = polyline.get(index - 1);
            GeoPoint end = polyline.get(index);
            double distance = distanceMeters(start, end);
            int segments = Math.max(1, (int) Math.ceil(distance / spacingMeters));
            for (int segment = 1; segment <= segments; segment++) {
                double ratio = segment / (double) segments;
                sampled.add(new GeoPoint(
                        start.longitude() + (end.longitude() - start.longitude()) * ratio,
                        start.latitude() + (end.latitude() - start.latitude()) * ratio));
            }
        }
        return sampled;
    }
}

