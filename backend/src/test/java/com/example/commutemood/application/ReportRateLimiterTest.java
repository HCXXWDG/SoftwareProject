package com.example.commutemood.application;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class ReportRateLimiterTest {
    private final ReportRateLimiter limiter = new ReportRateLimiter();

    @Test
    void allowsUpToTenReportsWithinOneMinute() {
        Instant now = Instant.parse("2026-06-10T08:00:00Z");

        for (int index = 0; index < 10; index++) {
            assertThat(limiter.allow("device-a", now.plusSeconds(index))).isTrue();
        }
    }

    @Test
    void blocksEleventhReportWithinSameWindow() {
        Instant now = Instant.parse("2026-06-10T08:00:00Z");

        for (int index = 0; index < 10; index++) {
            limiter.allow("device-b", now.plusSeconds(index));
        }

        assertThat(limiter.allow("device-b", now.plusSeconds(10))).isFalse();
    }

    @Test
    void allowsReportAfterWindowExpires() {
        Instant now = Instant.parse("2026-06-10T08:00:00Z");

        for (int index = 0; index < 10; index++) {
            limiter.allow("device-c", now.plusSeconds(index));
        }

        assertThat(limiter.allow("device-c", now.plusSeconds(61))).isTrue();
    }

    @Test
    void tracksDevicesIndependently() {
        Instant now = Instant.parse("2026-06-10T08:00:00Z");

        for (int index = 0; index < 10; index++) {
            limiter.allow("device-d", now.plusSeconds(index));
        }

        assertThat(limiter.allow("device-d", now.plusSeconds(10))).isFalse();
        assertThat(limiter.allow("device-e", now.plusSeconds(10))).isTrue();
    }
}
