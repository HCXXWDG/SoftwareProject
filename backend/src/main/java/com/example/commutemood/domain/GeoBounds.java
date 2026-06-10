package com.example.commutemood.domain;

public record GeoBounds(double west, double south, double east, double north) {
    public GeoBounds {
        if (west >= east || south >= north) {
            throw new IllegalArgumentException("Invalid bounding box");
        }
    }

    public static GeoBounds around(Iterable<GeoPoint> points, double paddingDegrees) {
        double west = Double.POSITIVE_INFINITY;
        double south = Double.POSITIVE_INFINITY;
        double east = Double.NEGATIVE_INFINITY;
        double north = Double.NEGATIVE_INFINITY;
        for (GeoPoint point : points) {
            west = Math.min(west, point.longitude());
            south = Math.min(south, point.latitude());
            east = Math.max(east, point.longitude());
            north = Math.max(north, point.latitude());
        }
        return new GeoBounds(west - paddingDegrees, south - paddingDegrees,
                east + paddingDegrees, north + paddingDegrees);
    }
}

