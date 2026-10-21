package com.example.commutemood.application;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.SaveOutcome;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReportServiceTest {

    private EmotionReportRepository repository;
    private DeviceIdentityService identityService;
    private ReportService service;

    @BeforeEach
    void setUp() {
        repository = mock(EmotionReportRepository.class);
        identityService = mock(DeviceIdentityService.class);
        when(identityService.hash("device-1")).thenReturn("hash-1");
        when(repository.save(any())).thenReturn(SaveOutcome.CREATED);
        // 用真实限频器，保证服务层与限频器的协作被覆盖
        service = new ReportService(repository, identityService, new ReportRateLimiter());
    }

    @Test
    void savesRealReportWithHashedDevice() {
        Instant reportedAt = Instant.now().minusSeconds(30);

        SaveOutcome outcome = service.submit("device-1", 120.2700, 31.4800, 25, EmotionTag.SHADE, reportedAt);

        assertThat(outcome).isEqualTo(SaveOutcome.CREATED);
        ArgumentCaptor<EmotionReport> captor = ArgumentCaptor.forClass(EmotionReport.class);
        verify(repository).save(captor.capture());
        EmotionReport saved = captor.getValue();
        assertThat(saved.deviceHash()).isEqualTo("hash-1");
        assertThat(saved.simulated()).as("接口写入的反馈必须是真实数据").isFalse();
        assertThat(saved.tag()).isEqualTo(EmotionTag.SHADE);
        assertThat(saved.stressLevel()).isEqualTo(25);
        assertThat(saved.reportedAt()).isEqualTo(reportedAt);
        assertThat(saved.location().longitude()).isEqualTo(120.2700);
        assertThat(saved.location().latitude()).isEqualTo(31.4800);
        assertThat(saved.id()).isNotNull();
    }

    @Test
    void missingReportedAtFallsBackToServerTime() {
        Instant before = Instant.now();

        service.submit("device-1", 120.2700, 31.4800, 50, EmotionTag.NOISE, null);

        ArgumentCaptor<EmotionReport> captor = ArgumentCaptor.forClass(EmotionReport.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().reportedAt()).isBetween(before, Instant.now());
    }

    @Test
    void duplicateOutcomeIsPassedThroughWithoutExtraWrite() {
        when(repository.save(any())).thenReturn(SaveOutcome.DUPLICATE);

        SaveOutcome outcome = service.submit("device-1", 120.2700, 31.4800, 50, EmotionTag.NOISE, Instant.now());

        assertThat(outcome).isEqualTo(SaveOutcome.DUPLICATE);
        verify(repository, times(1)).save(any());
    }

    @Test
    void rejectsStressLevelOutsideTheFiveLevels() {
        assertThatThrownBy(() -> service.submit("device-1", 120.2700, 31.4800, 30, EmotionTag.NOISE, Instant.now()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("stressLevel");
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsReportedAtTooFarInTheFuture() {
        Instant future = Instant.now().plus(10, ChronoUnit.MINUTES);

        assertThatThrownBy(() -> service.submit("device-1", 120.2700, 31.4800, 50, EmotionTag.NOISE, future))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("reportedAt");
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsReportedAtOlderThanOneDay() {
        Instant old = Instant.now().minus(25, ChronoUnit.HOURS);

        assertThatThrownBy(() -> service.submit("device-1", 120.2700, 31.4800, 50, EmotionTag.NOISE, old))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("reportedAt");
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsBlankDeviceIdBeforeTouchingStorage() {
        when(identityService.hash("")).thenThrow(new IllegalArgumentException("X-Device-Id is required"));

        assertThatThrownBy(() -> service.submit("", 120.2700, 31.4800, 50, EmotionTag.NOISE, Instant.now()))
                .isInstanceOf(IllegalArgumentException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void rateLimitStopsTheEleventhReportWithinOneMinute() {
        Instant now = Instant.now();
        for (int index = 0; index < 10; index++) {
            // 每次换设备标识以外的位置，避免被去重口径挡住，专门测限频
            assertThat(service.submit("device-1", 120.2700 + index * 0.01, 31.4800, 50, EmotionTag.NOISE, now))
                    .isEqualTo(SaveOutcome.CREATED);
        }

        assertThatThrownBy(() -> service.submit("device-1", 120.4000, 31.4800, 50, EmotionTag.NOISE, now))
                .isInstanceOf(RateLimitExceededException.class);
        // 被限频的那一次不能落库，否则重复/超限反馈会被计入新增
        verify(repository, times(10)).save(any());
    }
}
