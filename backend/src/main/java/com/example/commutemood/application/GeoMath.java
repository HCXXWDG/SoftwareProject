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
        a = Math.max(0, Math.min(1, a));
        return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    public static List<GeoPoint> sampleEvery(List<GeoPoint> polyline, double spacingMeters) {
        if (polyline == null || !Double.isFinite(spacingMeters) || spacingMeters <= 0) {
            throw new IllegalArgumentException("Polyline and a positive finite spacing are required");
        }
        if (polyline.stream().anyMatch(point -> point == null)) {
            throw new IllegalArgumentException("Polyline cannot contain null coordinates");
        }
        if (polyline.size() < 2) {
            return List.copyOf(polyline);
        }
        List<GeoPoint> sampled = new ArrayList<>();
        sampled.add(polyline.get(0));
        double traversed = 0;
        double nextSample = spacingMeters;
        for (int index = 1; index < polyline.size(); index++) {
            GeoPoint start = polyline.get(index - 1);
            GeoPoint end = polyline.get(index);
            double distance = distanceMeters(start, end);
            if (distance == 0) {
                continue;
            }
            // Carry the cumulative distance across vertices; vertex density cannot change weights.
            while (nextSample <= traversed + distance) {
                if (sampled.size() >= 100_000) {
                    throw new IllegalArgumentException("Polyline requires too many samples");
                }
                double ratio = (nextSample - traversed) / distance;
                sampled.add(new GeoPoint(
                        start.longitude() + (end.longitude() - start.longitude()) * ratio,
                        start.latitude() + (end.latitude() - start.latitude()) * ratio));
                nextSample += spacingMeters;
            }
            traversed += distance;
        }
        GeoPoint end = polyline.get(polyline.size() - 1);
        if (distanceMeters(sampled.get(sampled.size() - 1), end) > 0.000001) {
            sampled.add(end);
        }
        return sampled;
    }
}

