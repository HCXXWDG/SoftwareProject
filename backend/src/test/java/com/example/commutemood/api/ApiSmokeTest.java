package com.example.commutemood.api;

import com.example.commutemood.CommuteMoodApplication;
import com.example.commutemood.application.DeviceIdentityService;
import com.example.commutemood.config.DemoGeography;
import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.ScoredRoute;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.ReportScope;
import com.example.commutemood.repository.RouteQueryRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
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

    @Autowired
    private RouteQueryRepository routeQueryRepository;

    @Autowired
    private EmotionReportRepository emotionReportRepository;

    @Autowired
    private DeviceIdentityService identityService;

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
    void acceptsNewPositiveTagAndKeepsItSeparateFromSimulatedSeed() throws Exception {
        mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", "api-smoke-positive-tag-device")
                        .contentType("application/json")
                        .content("""
                                {
                                  "location":{"longitude":%.4f,"latitude":%.4f},
                                  "stressLevel":25,
                                  "tag":"SHADE",
                                  "reportedAt":"%s"
                                }
                                """.formatted(
                                DemoGeography.REPORT_LONGITUDE,
                                DemoGeography.REPORT_LATITUDE,
                                Instant.now())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("created"));

        GeoBounds aroundReport = new GeoBounds(
                DemoGeography.REPORT_LONGITUDE - 0.01,
                DemoGeography.REPORT_LATITUDE - 0.01,
                DemoGeography.REPORT_LONGITUDE + 0.01,
                DemoGeography.REPORT_LATITUDE + 0.01);
        Instant since = Instant.now().minus(Duration.ofHours(1));

        // 真实口径：能读到刚提交的树荫反馈，且不含任何演示种子
        List<EmotionReport> realOnly =
                emotionReportRepository.findWithin(aroundReport, since, ReportScope.REAL_ONLY);
        assertThat(realOnly)
                .isNotEmpty()
                .allSatisfy(report -> assertThat(report.simulated()).isFalse())
                .anySatisfy(report -> {
                    assertThat(report.tag()).isEqualTo(EmotionTag.SHADE);
                    assertThat(report.deviceHash()).isEqualTo(identityService.hash("api-smoke-positive-tag-device"));
                });

        // 演示口径：只会拿到种子数据，不会把真实反馈算进演示统计
        String realDeviceHash = identityService.hash("api-smoke-positive-tag-device");
        assertThat(emotionReportRepository.findWithin(aroundReport, since, ReportScope.SIMULATED_ONLY))
                .allSatisfy(report -> assertThat(report.simulated()).isTrue())
                .noneSatisfy(report -> assertThat(report.deviceHash()).isEqualTo(realDeviceHash));
    }

    @Test
    void rejectsUnknownEmotionTag() throws Exception {
        mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", "api-smoke-unknown-tag-device")
                        .contentType("application/json")
                        .content("""
                                {
                                  "location":{"longitude":%.4f,"latitude":%.4f},
                                  "stressLevel":50,
                                  "tag":"NOT_A_TAG"
                                }
                                """.formatted(
                                DemoGeography.REPORT_LONGITUDE,
                                DemoGeography.REPORT_LATITUDE)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"));
    }

    @Test
    void duplicateReportReturnsOkWithStableCodeAndIsNotCounted() throws Exception {
        String payload = """
                {
                  "location":{"longitude":%.4f,"latitude":%.4f},
                  "stressLevel":75,
                  "tag":"CROWD",
                  "reportedAt":"%s"
                }
                """.formatted(
                DemoGeography.REPORT_LONGITUDE + 0.05,
                DemoGeography.REPORT_LATITUDE + 0.05,
                Instant.now());

        mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", "api-smoke-duplicate-device")
                        .contentType("application/json")
                        .content(payload))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("created"))
                .andExpect(jsonPath("$.code").value("report_created"))
                .andExpect(jsonPath("$.counted").value(true));

        // 同设备、同地点、同时间窗：200 duplicate，不重复计数
        mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", "api-smoke-duplicate-device")
                        .contentType("application/json")
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("duplicate"))
                .andExpect(jsonPath("$.code").value("report_duplicate"))
                .andExpect(jsonPath("$.counted").value(false));
    }

    @Test
    void rateLimitedReportReturnsStableCode() throws Exception {
        String deviceId = "api-smoke-rate-limit-device";
        for (int index = 0; index < 10; index++) {
            mockMvc.perform(post("/api/v1/reports")
                            .header("X-Device-Id", deviceId)
                            .contentType("application/json")
                            .content("""
                                    {
                                      "location":{"longitude":%.4f,"latitude":%.4f},
                                      "stressLevel":50,
                                      "tag":"NOISE"
                                    }
                                    """.formatted(
                                    DemoGeography.REPORT_LONGITUDE - 0.20 + index * 0.01,
                                    DemoGeography.REPORT_LATITUDE - 0.20)))
                    .andExpect(status().isCreated());
        }

        mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", deviceId)
                        .contentType("application/json")
                        .content("""
                                {
                                  "location":{"longitude":%.4f,"latitude":%.4f},
                                  "stressLevel":50,
                                  "tag":"NOISE"
                                }
                                """.formatted(
                                DemoGeography.REPORT_LONGITUDE + 0.30,
                                DemoGeography.REPORT_LATITUDE + 0.30)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
    }

    @Test
    void rejectsInvalidReportStressLevelWithStableCode() throws Exception {
        mockMvc.perform(post("/api/v1/reports")
                        .header("X-Device-Id", "api-smoke-invalid-stress-device")
                        .contentType("application/json")
                        .content("""
                                {
                                  "location":{"longitude":%.4f,"latitude":%.4f},
                                  "stressLevel":30,
                                  "tag":"NOISE"
                                }
                                """.formatted(
                                DemoGeography.REPORT_LONGITUDE,
                                DemoGeography.REPORT_LATITUDE)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"));
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
    void acceptsCompletedCommuteFromSnapshotAndIsIdempotent() throws Exception {
        String deviceId = "api-smoke-commute-device";
        String deviceHash = identityService.hash(deviceId);
        ScoredRoute fast = new ScoredRoute(
                "route-fast", "最快路线 A", 1500, 1080, 40.0, 62.0, 0.72, true, false, List.of());
        ScoredRoute calm = new ScoredRoute(
                "route-calm", "少心累路线 B", 1700, 1210, 20.0, 43.0, 0.68, false, true, List.of());
        RouteComparison comparison = new RouteComparison(
                List.of(fast, calm), "route-fast", "route-calm", "ok", true);
        UUID snapshotId = routeQueryRepository.save(
                deviceHash,
                new GeoPoint(116.392, 39.905),
                new GeoPoint(116.405, 39.912),
                comparison);
        String operationId = UUID.randomUUID().toString();
        String payload = """
                {"snapshotId":"%s","operationId":"%s","routeId":"route-fast","endStressLevel":25}
                """.formatted(snapshotId, operationId);

        // 首次提交：201，评分/预计秒数取自快照而非前端
        mockMvc.perform(post("/api/v1/commutes/complete")
                        .header("X-Device-Id", deviceId)
                        .contentType("application/json")
                        .content(payload))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("created"))
                .andExpect(jsonPath("$.routeId").value("route-fast"))
                .andExpect(jsonPath("$.selectedScore").value(62.0))
                .andExpect(jsonPath("$.estimatedSeconds").value(1080))
                .andExpect(jsonPath("$.endStressLevel").value(25));

        // 相同操作 ID 重复提交：200 duplicate，趋势不重复计数
        mockMvc.perform(post("/api/v1/commutes/complete")
                        .header("X-Device-Id", deviceId)
                        .contentType("application/json")
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("duplicate"));
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
