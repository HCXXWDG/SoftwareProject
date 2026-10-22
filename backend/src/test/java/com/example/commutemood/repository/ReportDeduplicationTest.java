package com.example.commutemood.repository;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoPoint;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ReportDeduplicationTest {

    private static final Instant BASE = Instant.parse("2026-10-19T08:00:00Z");
    // 纬度方向 1 度约 111_320 米，用它换算出精确的米级偏移
    private static final double METERS_PER_DEGREE_LATITUDE = 111_320.0;

    @Test
    void sameDeviceWithinWindowAndRadiusIsDuplicate() {
        EmotionReport existing = report("device-a", 120.2700, 31.4800, BASE);
        EmotionReport candidate = report("device-a", 120.2700, 31.4800, BASE.plusSeconds(60));

        assertThat(ReportDeduplication.isDuplicate(existing, candidate)).isTrue();
    }

    @Test
    void windowBoundaryIsInclusive() {
        EmotionReport existing = report("device-a", 120.2700, 31.4800, BASE);
        long windowSeconds = ReportDeduplication.WINDOW.toSeconds();

        assertThat(ReportDeduplication.isDuplicate(existing,
                report("device-a", 120.2700, 31.4800, BASE.plusSeconds(windowSeconds))))
                .as("正好 %d 秒仍算同一次反馈", windowSeconds)
                .isTrue();
        assertThat(ReportDeduplication.isDuplicate(existing,
                report("device-a", 120.2700, 31.4800, BASE.plusSeconds(windowSeconds + 1))))
                .isFalse();
    }

    @Test
    void windowWorksInBothTimeDirections() {
        EmotionReport existing = report("device-a", 120.2700, 31.4800, BASE);

        assertThat(ReportDeduplication.isDuplicate(existing,
                report("device-a", 120.2700, 31.4800, BASE.minusSeconds(120))))
                .as("补传的稍早时间戳同样命中去重")
                .isTrue();
    }

    @Test
    void radiusBoundaryFollowsMetersNotDegreeBox() {
        EmotionReport existing = report("device-a", 120.2700, 31.4800, BASE);
        double inside = (ReportDeduplication.RADIUS_METERS - 1) / METERS_PER_DEGREE_LATITUDE;
        double outside = (ReportDeduplication.RADIUS_METERS + 5) / METERS_PER_DEGREE_LATITUDE;

        assertThat(ReportDeduplication.isDuplicate(existing,
                report("device-a", 120.2700, 31.4800 + inside, BASE)))
                .isTrue();
        assertThat(ReportDeduplication.isDuplicate(existing,
                report("device-a", 120.2700, 31.4800 + outside, BASE)))
                .isFalse();
    }

    @Test
    void differentDevicesAtSameSpotAreBothCounted() {
        EmotionReport existing = report("device-a", 120.2700, 31.4800, BASE);

        assertThat(ReportDeduplication.isDuplicate(existing,
                report("device-b", 120.2700, 31.4800, BASE)))
                .as("不同设备在同一地点是多源数据，不能互相去重")
                .isFalse();
    }

    @Test
    void nullArgumentsAreNeverDuplicate() {
        EmotionReport existing = report("device-a", 120.2700, 31.4800, BASE);

        assertThat(ReportDeduplication.isDuplicate(null, existing)).isFalse();
        assertThat(ReportDeduplication.isDuplicate(existing, null)).isFalse();
    }

    private EmotionReport report(String deviceHash, double longitude, double latitude, Instant reportedAt) {
        return new EmotionReport(
                UUID.randomUUID(),
                deviceHash,
                new GeoPoint(longitude, latitude),
                50,
                EmotionTag.NOISE,
                reportedAt,
                false);
    }
}
