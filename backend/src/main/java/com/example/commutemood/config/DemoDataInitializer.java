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
        Random random = new Random(DemoGeography.RANDOM_SEED);
        Instant now = Instant.now();
        DemoGeography.Cluster[] clusters = DemoGeography.Cluster.values();
        for (int index = 0; index < 500; index++) {
            DemoGeography.Cluster cluster = clusters[index % clusters.length];
            double longitude = cluster.longitude() + random.nextGaussian() * cluster.spread();
            double latitude = cluster.latitude() + random.nextGaussian() * cluster.spread();
            int stress = clampToLevel((int) Math.round(cluster.meanStress() + random.nextGaussian() * 15));
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

    private int clampToLevel(int stress) {
        int[] levels = {0, 25, 50, 75, 100};
        int nearest = levels[0];
        for (int level : levels) {
            if (Math.abs(level - stress) < Math.abs(nearest - stress)) {
                nearest = level;
            }
        }
        return nearest;
    }
}
