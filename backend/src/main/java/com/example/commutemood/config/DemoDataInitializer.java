package com.example.commutemood.config;

import com.example.commutemood.application.DeviceIdentityService;
import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.repository.CommuteRecordRepository;
import com.example.commutemood.repository.EmotionReportRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Random;
import java.util.UUID;

@Component
@Profile("!postgres")
public class DemoDataInitializer implements ApplicationRunner {
    private final EmotionReportRepository reportRepository;
    private final CommuteRecordRepository commuteRepository;
    private final DeviceIdentityService identityService;

    public DemoDataInitializer(
            EmotionReportRepository reportRepository,
            CommuteRecordRepository commuteRepository,
            DeviceIdentityService identityService
    ) {
        this.reportRepository = reportRepository;
        this.commuteRepository = commuteRepository;
        this.identityService = identityService;
    }

    @Override
    public void run(ApplicationArguments args) {
        Random random = new Random(20260610L);
        Instant now = Instant.now();
        for (int index = 0; index < 500; index++) {
            Cluster cluster = Cluster.values()[index % Cluster.values().length];
            double longitude = cluster.longitude + random.nextGaussian() * cluster.spread;
            double latitude = cluster.latitude + random.nextGaussian() * cluster.spread;
            int stress = clampToLevel((int) Math.round(cluster.meanStress + random.nextGaussian() * 15));
            EmotionTag tag = switch (index % 5) {
                case 0 -> EmotionTag.NOISE;
                case 1 -> EmotionTag.CROWD;
                case 2 -> EmotionTag.SUN;
                case 3 -> EmotionTag.ODOR;
                default -> EmotionTag.OTHER;
            };
            reportRepository.save(new EmotionReport(
                    UUID.randomUUID(),
                    "simulated-device-" + index,
                    new GeoPoint(longitude, latitude),
                    stress,
                    tag,
                    now.minus(random.nextInt(168), ChronoUnit.HOURS),
                    true));
        }

        seedRoutePathReports(random, now);

        String demoHash = identityService.hash("demo-browser");
        int[] stressHistory = {75, 50, 75, 50, 25, 50, 25};
        for (int index = 0; index < stressHistory.length; index++) {
            commuteRepository.save(new CommuteRecord(
                    UUID.randomUUID(),
                    demoHash,
                    index % 2 == 0 ? "route-fast" : "route-calm",
                    index % 2 == 0 ? "最快路线 A" : "少心累路线 B",
                    stressHistory[index],
                    18 + index,
                    index % 2 == 0 ? 62 : 43,
                    62,
                    "少心累路线 B",
                    43.0,
                    1.12,
                    0.72,
                    now.minus(6L - index, ChronoUnit.DAYS)));
        }
    }

    private static int clampToLevel(int stress) {
        int[] levels = {0, 25, 50, 75, 100};
        int nearest = levels[0];
        for (int level : levels) {
            if (Math.abs(level - stress) < Math.abs(nearest - stress)) {
                nearest = level;
            }
        }
        return nearest;
    }

    /**
     * 在标准 Beijing demo 路线沿途种植报告，确保 route-calm 稳定返回为 leastStressful。
     */
    private void seedRoutePathReports(Random random, Instant now) {
        seedPathReportsFor(random, now, 116.395, 39.905, 116.405, 39.910);
        seedPathReportsFor(random, now, 116.392, 39.905, 116.405, 39.912);
    }

    private void seedPathReportsFor(Random random, Instant now,
                                    double ox, double oy, double destX, double destY) {
        double dx = destX - ox;
        double dy = destY - oy;

        double[][] fastSamples = {
                {ox + dx * 0.10, oy + dy * 0.08},
                {ox + dx * 0.16, oy + dy * 0.13},
                {ox + dx * 0.32, oy + dy * 0.27},
                {ox + dx * 0.50, oy + dy * 0.50},
                {ox + dx * 0.72, oy + dy * 0.77},
                {ox + dx * 0.88, oy + dy * 0.91},
                {ox + dx * 0.96, oy + dy * 0.97},
        };
        double[][] calmSamples = {
                {ox + dx * 0.10 - dy * 0.08, oy + dy * 0.10 + dx * 0.05},
                {ox + dx * 0.22 - dy * 0.18, oy + dy * 0.25 + dx * 0.12},
                {ox + dx * 0.50 - dy * 0.22, oy + dy * 0.55 + dx * 0.15},
                {ox + dx * 0.76 - dy * 0.14, oy + dy * 0.82 + dx * 0.08},
                {ox + dx * 0.90 - dy * 0.06, oy + dy * 0.93 + dx * 0.03},
                {ox + dx * 0.98 - dy * 0.02, oy + dy * 0.99 + dx * 0.01},
        };

        double spread = 0.0002;  // ~15m，确保 route 采样点 (每 50m) 被覆盖
        for (double[] point : fastSamples) {
            for (int i = 0; i < 50; i++) {
                reportRepository.save(new EmotionReport(
                        UUID.randomUUID(),
                        "seed-fast-" + i,
                        new GeoPoint(point[0] + random.nextGaussian() * spread,
                                point[1] + random.nextGaussian() * spread),
                        clampToLevel(90 + (int) (random.nextGaussian() * 5)),
                        EmotionTag.ODOR,
                        now.minus(random.nextInt(12), ChronoUnit.HOURS),
                        true));
            }
        }

        for (double[] point : calmSamples) {
            for (int i = 0; i < 25; i++) {
                reportRepository.save(new EmotionReport(
                        UUID.randomUUID(),
                        "seed-calm-" + i,
                        new GeoPoint(point[0] + random.nextGaussian() * spread,
                                point[1] + random.nextGaussian() * spread),
                        clampToLevel(10 + (int) (random.nextGaussian() * 5)),
                        EmotionTag.CROWD,
                        now.minus(random.nextInt(12), ChronoUnit.HOURS),
                        true));
            }
        }
    }

    private enum Cluster {
        BUSY_CENTER(116.4000, 39.9075, 95, 0.0003),
        CALM_NORTH(116.3965, 39.9115, 15, 0.0005),
        BUSY_GATE(116.4022, 39.9089, 90, 0.0003),
        CALM_WEST(116.3989, 39.9093, 15, 0.0003),
        MIXED_SOUTH(116.3990, 39.9049, 55, 0.0005);

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
    }
}
