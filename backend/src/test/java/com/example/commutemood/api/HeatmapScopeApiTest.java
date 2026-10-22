package com.example.commutemood.api;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.repository.EmotionReportRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Use the base (non-demo) configuration without needing a live database. */
@SpringBootTest
@ActiveProfiles("heatmap-real-test")
@AutoConfigureMockMvc
class HeatmapScopeApiTest {
    private static final AtomicInteger NEXT_LOCATION = new AtomicInteger();
    @Autowired MockMvc http;
    @Autowired EmotionReportRepository reports;
    private String bbox;

    @BeforeEach
    void seedSeparateSources() {
        // Separate locations keep tests independent without clearing shared repositories.
        double longitude = 122 + NEXT_LOCATION.incrementAndGet() * 0.01;
        GeoPoint point = new GeoPoint(longitude, 32);
        bbox = "%s,31.999,%s,32.001".formatted(longitude - 0.001, longitude + 0.001);
        reports.save(new EmotionReport(UUID.randomUUID(), "scope-real", point,
                25, EmotionTag.QUIET, Instant.now(), false));
        reports.save(new EmotionReport(UUID.randomUUID(), "scope-demo", point,
                100, EmotionTag.NOISE, Instant.now(), true));
    }

    @Test
    void baseConfigurationDefaultsToRealReports() throws Exception {
        http.perform(get("/api/v1/heatmap").param("bbox", bbox))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].count").value(1))
                .andExpect(jsonPath("$[0].feedbackSource").value("REAL"));
    }

    @Test
    void explicitAllScopeIncludesBothSourcesWithoutMislabeling() throws Exception {
        http.perform(get("/api/v1/heatmap").param("bbox", bbox).param("scope", "ALL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].count").value(2))
                .andExpect(jsonPath("$[0].feedbackSource").value("MIXED"));
    }

    @Test
    void explicitSimulatedScopeOverridesRealDefault() throws Exception {
        http.perform(get("/api/v1/heatmap").param("bbox", bbox).param("scope", "SIMULATED_ONLY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].count").value(1))
                .andExpect(jsonPath("$[0].feedbackSource").value("DEMO"));
    }

    @Test
    void rejectsInvalidScopeInsteadOfSilentlyUsingDefault() throws Exception {
        http.perform(get("/api/v1/heatmap").param("bbox", bbox).param("scope", "INVALID"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"));
    }
}
