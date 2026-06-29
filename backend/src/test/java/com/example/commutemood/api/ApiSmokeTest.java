package com.example.commutemood.api;

import com.example.commutemood.CommuteMoodApplication;
import com.example.commutemood.config.DemoGeography;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = CommuteMoodApplication.class)
@AutoConfigureMockMvc
class ApiSmokeTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void servesActuatorInfo() throws Exception {
        mockMvc.perform(get("/actuator/info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.app.name").value("commute-mood-api"))
                .andExpect(jsonPath("$.app.version").value("1.0.0"))
                .andExpect(jsonPath("$.app.mode").value("demo"));
    }

    @Test
    void acceptsMoodReport() throws Exception {
        mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", "api-smoke-report-device")
                        .contentType("application/json")
                        .content("""
                                {
                                  "location":{"longitude":%.4f,"latitude":%.4f},
                                  "stressLevel":75,
                                  "tag":"CROWD",
                                  "reportedAt":"%s"
                                }
                                """.formatted(
                                DemoGeography.REPORT_LONGITUDE,
                                DemoGeography.REPORT_LATITUDE,
                                Instant.now())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("created"));
    }

    @Test
    void servesHeatmapFromDemoSeed() throws Exception {
        mockMvc.perform(get("/api/v1/heatmap")
                        .param("bbox", DemoGeography.HEATMAP_BBOX)
                        .param("zoom", "16")
                        .param("hours", "168"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].cellId").exists());
    }

    @Test
    void refreshesHeatmapCacheFromDemoSeed() throws Exception {
        mockMvc.perform(post("/api/v1/heatmap/refresh")
                        .param("bbox", DemoGeography.HEATMAP_BBOX)
                        .param("zoom", "16")
                        .param("hours", "168"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].cellId").exists());
    }

    @Test
    void rejectsInvalidHeatmapBounds() throws Exception {
        mockMvc.perform(get("/api/v1/heatmap")
                        .param("bbox", "NaN,39.90,116.41,39.92"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"));
    }

    @Test
    void rejectsMissingHeatmapBounds() throws Exception {
        mockMvc.perform(get("/api/v1/heatmap"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"));
    }

    @Test
    void rejectsInvalidHeatmapZoomType() throws Exception {
        mockMvc.perform(get("/api/v1/heatmap")
                        .param("bbox", DemoGeography.HEATMAP_BBOX)
                        .param("zoom", "bad"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"));
    }

    @Test
    void comparesRoutesWithoutAmapKey() throws Exception {
        mockMvc.perform(post("/api/v1/routes/compare")
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
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.routes.length()").value(3))
                .andExpect(jsonPath("$.fastestRouteId").value("route-fast"))
                .andExpect(jsonPath("$.leastStressfulRouteId").value("route-calm"))
                .andExpect(jsonPath("$.recommendation").exists());
    }

    @Test
    void allowsConfiguredCorsOrigins() throws Exception {
        mockMvc.perform(options("/api/v1/heatmap")
                        .param("bbox", DemoGeography.HEATMAP_BBOX)
                        .param("zoom", "16")
                        .header("Origin", "http://127.0.0.1:5173")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://127.0.0.1:5173"));
    }

    @Test
    void allowsCapacitorHttpLocalhostOrigin() throws Exception {
        mockMvc.perform(options("/api/v1/heatmap")
                        .param("bbox", DemoGeography.HEATMAP_BBOX)
                        .param("zoom", "16")
                        .header("Origin", "http://localhost")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost"));
    }

    @Test
    void allowsCapacitorHttpsLocalhostOrigin() throws Exception {
        mockMvc.perform(options("/api/v1/heatmap")
                        .param("bbox", DemoGeography.HEATMAP_BBOX)
                        .param("zoom", "16")
                        .header("Origin", "https://localhost")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://localhost"));
    }

    @Test
    void rejectsUnknownCorsOrigin() throws Exception {
        mockMvc.perform(options("/api/v1/heatmap")
                        .param("bbox", DemoGeography.HEATMAP_BBOX)
                        .param("zoom", "16")
                        .header("Origin", "http://evil.example.com")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden());
    }

    @Test
    void rejectsMalformedJsonBody() throws Exception {
        mockMvc.perform(post("/api/v1/routes/compare")
                        .contentType("application/json")
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"));
    }

    @Test
    void servesRouteHistoryForDevice() throws Exception {
        mockMvc.perform(get("/api/v1/routes/history")
                        .header("X-Device-Id", "demo-browser"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void rejectsRouteHistoryWithoutDeviceId() throws Exception {
        mockMvc.perform(get("/api/v1/routes/history"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"));
    }

    @Test
    void servesCommuteTrendSummaryForDevice() throws Exception {
        mockMvc.perform(get("/api/v1/commutes/trends")
                        .header("X-Device-Id", "demo-browser")
                        .param("days", "7")
                        .param("timezone", "Asia/Shanghai"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCommutes").value(7))
                .andExpect(jsonPath("$.summary.averageStress").value(50.0))
                .andExpect(jsonPath("$.summary.direction").value("improving"));
    }

    @Test
    void acceptsCompletedCommute() throws Exception {
        mockMvc.perform(post("/api/v1/commutes/complete")
                        .header("X-Device-Id", "api-smoke-commute-device")
                        .contentType("application/json")
                        .content("""
                                {
                                  "routeId":"route-fast",
                                  "routeLabel":"最快路线 A",
                                  "endStressLevel":25,
                                  "durationMinutes":18,
                                  "selectedScore":62,
                                  "fastestScore":62,
                                  "alternativeLabel":"少心累路线 B",
                                  "alternativeScore":43,
                                  "alternativeDurationRatio":1.12,
                                  "confidence":0.72,
                                  "completedAt":"%s"
                                }
                                """.formatted(Instant.now())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.routeId").value("route-fast"))
                .andExpect(jsonPath("$.endStressLevel").value(25));
    }

    @Test
    void rejectsInvalidTrendTimezone() throws Exception {
        mockMvc.perform(get("/api/v1/commutes/trends")
                        .header("X-Device-Id", "demo-browser")
                        .param("timezone", "Not/AZone"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"));
    }
}
