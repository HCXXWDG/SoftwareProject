package com.example.commutemood.integration;

import com.example.commutemood.CommuteMoodApplication;
import com.example.commutemood.config.DemoGeography;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = CommuteMoodApplication.class,
        properties = {"app.amap.web-key=", "app.routing.demo-enabled=false"})
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
@Testcontainers(disabledWithoutDocker = true)
class PostgisIntegrationTest {
    private static final String DEVICE_HASH_SALT = "local-demo-salt-change-before-deploy";

    @Container
    @SuppressWarnings("resource")
    static PostgreSQLContainer<?> postgis = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("commute_mood")
            .withUsername("commute")
            .withPassword("commute_dev_password");

    @DynamicPropertySource
    static void registerDataSource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgis::getJdbcUrl);
        registry.add("spring.datasource.username", postgis::getUsername);
        registry.add("spring.datasource.password", postgis::getPassword);
        registry.add("DEVICE_HASH_SALT", () -> DEVICE_HASH_SALT);
    }

    @Autowired
    private MockMvc mockMvc;

    @Test
    void servesHeatmapFromFlywaySeed() throws Exception {
        mockMvc.perform(get("/api/v1/heatmap")
                        .param("bbox", DemoGeography.HEATMAP_BBOX)
                        .param("zoom", "16")
                        .param("scope", "SIMULATED_ONLY")
                        .param("hours", "168"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].cellId").exists());
    }

    @Test
    void missingExternalConfigurationReturnsExplicitUnavailableError() throws Exception {
        mockMvc.perform(post("/api/v1/routes/compare")
                        .header("X-Device-Id", "postgis-integration-device")
                        .contentType("application/json")
                        .content("""
                                {
                                  "origin":{"longitude":%.3f,"latitude":%.3f},
                                  "destination":{"longitude":%.3f,"latitude":%.3f}
                                }
                                """.formatted(
                                DemoGeography.ORIGIN_LONGITUDE,
                                DemoGeography.ORIGIN_LATITUDE,
                                DemoGeography.DESTINATION_LONGITUDE,
                                DemoGeography.DESTINATION_LATITUDE)))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value(503))
                .andExpect(jsonPath("$.code").value("route_provider_unavailable"))
                .andExpect(jsonPath("$.message").isNotEmpty())
                .andExpect(jsonPath("$.timestamp").exists())
                .andExpect(jsonPath("$.routes").doesNotExist())
                .andExpect(jsonPath("$.snapshotId").doesNotExist());
    }

    @Test
    void servesCommuteTrendsForSeededDemoBrowser() throws Exception {
        mockMvc.perform(get("/api/v1/commutes/trends")
                        .header("X-Device-Id", "demo-browser")
                        .param("days", "7")
                        .param("timezone", "Asia/Shanghai"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCommutes").value(7))
                .andExpect(jsonPath("$.summary.direction").exists());
    }

    @Test
    void persistsReportAndDetectsDuplicateWithinRadius() throws Exception {
        String payload = """
                {
                  "location":{"longitude":%.4f,"latitude":%.4f},
                  "stressLevel":75,
                  "tag":"CROWD",
                  "reportedAt":"%s"
                }
                """.formatted(DemoGeography.REPORT_LONGITUDE, DemoGeography.REPORT_LATITUDE, Instant.now());

        mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", "postgis-report-device")
                        .contentType("application/json")
                        .content(payload))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", "postgis-report-device")
                        .contentType("application/json")
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("duplicate"))
                .andExpect(jsonPath("$.code").value("report_duplicate"))
                .andExpect(jsonPath("$.counted").value(false));
    }

    @Test
    void refreshesHeatmapCacheIntoPostgis() throws Exception {
        mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", "postgis-cache-device")
                        .contentType("application/json")
                        .content("""
                                {"location":{"longitude":%.7f,"latitude":%.7f},"stressLevel":25,"tag":"QUIET"}
                                """.formatted(DemoGeography.REPORT_LONGITUDE, DemoGeography.REPORT_LATITUDE)))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/v1/heatmap/refresh")
                        .param("bbox", DemoGeography.HEATMAP_BBOX)
                        .param("zoom", "16")
                        .param("hours", "168"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].cellId").exists());
    }
}
