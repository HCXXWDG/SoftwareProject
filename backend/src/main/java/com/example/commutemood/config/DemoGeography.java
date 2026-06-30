package com.example.commutemood.config;

/**
 * Shared demo geography for GCJ-02 campus seed data (Jiangnan University Lihu campus area).
 */
public final class DemoGeography {
    public static final String HEATMAP_BBOX = "120.26067,31.47278,120.27946,31.49417";
    public static final double ORIGIN_LONGITUDE = 120.2735103;
    public static final double ORIGIN_LATITUDE = 31.4753281;
    public static final double DESTINATION_LONGITUDE = 120.2743195;
    public static final double DESTINATION_LATITUDE = 31.4832753;
    public static final double REPORT_LONGITUDE = 120.273915;
    public static final double REPORT_LATITUDE = 31.479302;
    public static final long RANDOM_SEED = 20260610L;

    private DemoGeography() {
    }

    public enum Cluster {
        BUSY_GATE(120.2740, 31.4830, 78, 0.0012),
        CALM_LAKE(120.2680, 31.4810, 24, 0.0014),
        BUSY_CANTEEN(120.2750, 31.4790, 72, 0.0008),
        CALM_DORM(120.2730, 31.4760, 32, 0.0010),
        MIXED_LIBRARY(120.2760, 31.4820, 55, 0.0013);

        private final double longitude;
        private final double latitude;
        private final double meanStress;
        private final double spread;

        Cluster(double longitude, double latitude, double meanStress, double spread) {
            this.longitude = longitude;
            this.latitude = latitude;
            this.meanStress = meanStress;
            this.spread = spread;
        }

        public double longitude() {
            return longitude;
        }

        public double latitude() {
            return latitude;
        }

        public double meanStress() {
            return meanStress;
        }

        public double spread() {
            return spread;
        }
    }
}
