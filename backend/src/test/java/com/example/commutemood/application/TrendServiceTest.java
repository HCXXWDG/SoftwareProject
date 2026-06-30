package com.example.commutemood.application;

import com.example.commutemood.config.AppProperties;
import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.repository.CommuteRecordRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TrendServiceTest {
    private final CommuteRecordRepository repository = mock(CommuteRecordRepository.class);
    private final DeviceIdentityService identityService = new DeviceIdentityService(
            new AppProperties("test-salt", new AppProperties.Amap(""), "http://localhost:5173"));
    private final TrendService service = new TrendService(repository, identityService);

    @Test
    void summarizesImprovingTrend() {
        when(repository.findByDeviceSince(eq(identityService.hash("demo-browser")), any()))
                .thenReturn(List.of(
                        record(75, 3),
                        record(50, 2),
                        record(25, 1),
                        record(25, 0)));

        TrendService.TrendResult result = service.getTrends(
                "demo-browser", 7, ZoneId.of("Asia/Shanghai"));

        assertThat(result.totalCommutes()).isEqualTo(4);
        assertThat(result.summary().averageStress()).isEqualTo(43.75);
        assertThat(result.summary().stressDelta()).isEqualTo(-37.5);
        assertThat(result.summary().direction()).isEqualTo("improving");
        assertThat(result.summary().sampleSufficient()).isTrue();
    }

    @Test
    void marksEmptyHistoryAsUnknown() {
        when(repository.findByDeviceSince(any(), any())).thenReturn(List.of());

        TrendService.TrendResult result = service.getTrends(
                "demo-browser", 7, ZoneId.of("Asia/Shanghai"));

        assertThat(result.totalCommutes()).isZero();
        assertThat(result.summary().averageStress()).isNull();
        assertThat(result.summary().stressDelta()).isNull();
        assertThat(result.summary().direction()).isEqualTo("unknown");
        assertThat(result.summary().sampleSufficient()).isFalse();
    }

    private CommuteRecord record(int stressLevel, int daysAgo) {
        return new CommuteRecord(
                UUID.randomUUID(),
                identityService.hash("demo-browser"),
                "route-fast",
                "Fast",
                stressLevel,
                20,
                50,
                60,
                "Calm",
                40.0,
                1.1,
                0.8,
                Instant.now().minus(daysAgo, ChronoUnit.DAYS));
    }
}
