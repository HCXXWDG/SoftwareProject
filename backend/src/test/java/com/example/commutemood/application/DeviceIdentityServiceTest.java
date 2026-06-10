package com.example.commutemood.application;

import com.example.commutemood.config.AppProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DeviceIdentityServiceTest {
    private final DeviceIdentityService service = new DeviceIdentityService(
            new AppProperties("test-salt", new AppProperties.Amap(""), List.of()));

    @Test
    void hashesDeviceIdDeterministicallyWithoutKeepingRawValue() {
        String first = service.hash("browser-id");
        String second = service.hash("browser-id");

        assertThat(first).isEqualTo(second).hasSize(64).doesNotContain("browser-id");
    }

    @Test
    void rejectsBlankDeviceId() {
        assertThatThrownBy(() -> service.hash(" "))
                .isInstanceOf(IllegalArgumentException.class);
    }
}

