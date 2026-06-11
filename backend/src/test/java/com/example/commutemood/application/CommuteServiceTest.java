package com.example.commutemood.application;

import com.example.commutemood.config.AppProperties;
import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.repository.CommuteRecordRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class CommuteServiceTest {
    private final CommuteRecordRepository repository = mock(CommuteRecordRepository.class);
    private final DeviceIdentityService identityService = new DeviceIdentityService(
            new AppProperties("test-salt", new AppProperties.Amap(""), List.of("http://localhost:5173")));
    private final CommuteService service = new CommuteService(repository, identityService);

    @Test
    void savesCompletedCommute() {
        Instant completedAt = Instant.now().minusSeconds(120);

        CommuteRecord saved = service.complete(
                "commute-device",
                "route-fast",
                "Fast route A",
                25,
                28,
                52.1,
                48.0,
                "Calm route B",
                41.5,
                1.12,
                0.72,
                completedAt);

        assertThat(saved.routeId()).isEqualTo("route-fast");
        assertThat(saved.endStressLevel()).isEqualTo(25);
        assertThat(saved.completedAt()).isEqualTo(completedAt);
        ArgumentCaptor<CommuteRecord> captor = ArgumentCaptor.forClass(CommuteRecord.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().deviceHash()).isEqualTo(identityService.hash("commute-device"));
    }

    @Test
    void allowsNullAlternativeFields() {
        CommuteRecord saved = service.complete(
                "commute-device",
                "route-fast",
                "Fast route A",
                50,
                20,
                55.0,
                55.0,
                null,
                null,
                null,
                0.5,
                null);

        assertThat(saved.alternativeLabel()).isNull();
        assertThat(saved.alternativeScore()).isNull();
        assertThat(saved.alternativeDurationRatio()).isNull();
        assertThat(saved.completedAt()).isNotNull();
    }

    @Test
    void rejectsInvalidEndStressLevel() {
        assertThatThrownBy(() -> service.complete(
                "commute-device", "route-fast", "Fast", 42, 20,
                50, 50, null, null, null, 0.5, Instant.now()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("endStressLevel");
    }

    @Test
    void rejectsInvalidDuration() {
        assertThatThrownBy(() -> service.complete(
                "commute-device", "route-fast", "Fast", 50, 0,
                50, 50, null, null, null, 0.5, Instant.now()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("durationMinutes");
    }
}
