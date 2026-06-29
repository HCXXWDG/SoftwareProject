package com.example.commutemood.domain;

public record GeoPoint(double longitude, double latitude) {
    public GeoPoint {
        if (!Double.isFinite(longitude) || !Double.isFinite(latitude)
                || longitude < -180 || longitude > 180
                || latitude < -90 || latitude > 90) {
            throw new IllegalArgumentException("Invalid longitude or latitude");
        }
    }
}

