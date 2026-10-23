package com.example.commutemood.config;

/**
 * Shared GCJ-02 demo geography for Liangxi District, Wuxi.
 * Landmark coordinates were checked against AMap on 2026-10-23.
 */
public final class DemoGeography {
    public static final String HEATMAP_BBOX = "120.240331,31.512825,120.352851,31.630931";
    public static final double ORIGIN_LONGITUDE = 120.308640;
    public static final double ORIGIN_LATITUDE = 31.566744;
    public static final double DESTINATION_LONGITUDE = 120.301784;
    public static final double DESTINATION_LATITUDE = 31.578312;
    public static final double REPORT_LONGITUDE = 120.308567;
    public static final double REPORT_LATITUDE = 31.576862;
    public static final long RANDOM_SEED = 20260610L;

    private DemoGeography() {
    }

    public enum Cluster {
        BUSY_STATION(120.306343, 31.588016, 78, 0.0012),
        CALM_CANAL(120.318564, 31.557328, 24, 0.0014),
        BUSY_NANCHAN_TEMPLE(120.308640, 31.566744, 72, 0.0008),
        CALM_DONGLIN_ACADEMY(120.308567, 31.576862, 32, 0.0010),
        MIXED_CHONGAN_TEMPLE(120.301784, 31.578312, 55, 0.0013);

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
