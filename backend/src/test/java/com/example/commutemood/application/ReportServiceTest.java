package com.example.commutemood.application;

import com.example.commutemood.config.AppProperties;
import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.SaveOutcome;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReportServiceTest {
    private final EmotionReportRepository repository = mock(EmotionReportRepository.class);
    private final DeviceIdentityService identityService = new DeviceIdentityService(
            new AppProperties("test-salt", new AppProperties.Amap(""), List.of("http://localhost:5173")));
    private final ReportRateLimiter rateLimiter = new ReportRateLimiter();
    private final ReportService service = new ReportService(repository, identityService, rateLimiter);

    @Test
    void savesValidReport() {
        when(repository.save(any())).thenReturn(SaveOutcome.CREATED);
        Instant reportedAt = Instant.now().minusSeconds(60);

        SaveOutcome outcome = service.submit(
                "report-device",
                116.401,
                39.915,
                75,
                EmotionTag.CROWD,
                reportedAt);

        assertThat(outcome).isEqualTo(SaveOutcome.CREATED);
        ArgumentCaptor<EmotionReport> captor = ArgumentCaptor.forClass(EmotionReport.class);
        verify(repository).save(captor.capture());
        EmotionReport saved = captor.getValue();
        assertThat(saved.deviceHash()).isEqualTo(identityService.hash("report-device"));
        assertThat(saved.location()).isEqualTo(new GeoPoint(116.401, 39.915));
        assertThat(saved.stressLevel()).isEqualTo(75);
        assertThat(saved.tag()).isEqualTo(EmotionTag.CROWD);
        assertThat(saved.simulated()).isFalse();
    }

    @Test
    void rejectsInvalidStressLevel() {
        assertThatThrownBy(() -> service.submit(
                "report-device", 116.4, 39.9, 42, EmotionTag.OTHER, Instant.now()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("stressLevel");
    }

    @Test
    void rejectsReportedAtOutsideAllowedWindow() {
        assertThatThrownBy(() -> service.submit(
                "report-device", 116.4, 39.9, 50, EmotionTag.OTHER, Instant.now().plusSeconds(600)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("reportedAt");
    }

    @Test
    void rateLimitsAfterTenReportsInOneMinute() {
        when(repository.save(any())).thenReturn(SaveOutcome.CREATED);
        Instant reportedAt = Instant.now();

        for (int index = 0; index < 10; index++) {
            service.submit("rate-limit-device", 116.4, 39.9, 50, EmotionTag.OTHER, reportedAt);
        }

        assertThatThrownBy(() -> service.submit(
                "rate-limit-device", 116.4, 39.9, 50, EmotionTag.OTHER, reportedAt))
                .isInstanceOf(RateLimitExceededException.class);
        verify(repository, times(10)).save(any());
    }
}
