package com.example.commutemood.config;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AppPropertiesTest {
    @Test
    void corsOriginListParsesCommaSeparatedValue() {
        AppProperties properties = new AppProperties(
                "salt", new AppProperties.Amap(""),
                "http://localhost:5173,http://127.0.0.1:5173,http://localhost,https://localhost");

        List<String> origins = properties.corsOriginList();

        assertThat(origins).containsExactly(
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost",
                "https://localhost");
    }

    @Test
    void corsOriginListReturnsDefaultWhenBlank() {
        AppProperties properties = new AppProperties(
                "salt", new AppProperties.Amap(""), "");

        assertThat(properties.corsOriginList()).containsExactly("http://localhost:5173");
    }
}
