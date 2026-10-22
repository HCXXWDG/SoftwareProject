package com.example.commutemood.api;

import com.example.commutemood.application.GeoMath;
import com.example.commutemood.domain.*;
import com.example.commutemood.external.AmapRouteProvider;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.RouteQueryRepository;
import com.example.commutemood.application.DeviceIdentityService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "app.routing.demo-enabled=true")
@AutoConfigureMockMvc
class RouteSnapshotFlowTest {
    @Autowired MockMvc http;
    @Autowired ObjectMapper json;
    @Autowired EmotionReportRepository reports;
    @Autowired RouteQueryRepository snapshots;
    @Autowired DeviceIdentityService identities;
    @MockitoBean AmapRouteProvider provider;

    @Test
    void compareIdCanCompleteOwnedSubMinuteRouteAndReplayCountsOnce() throws Exception {
        GeoPoint origin = new GeoPoint(120.27, 31.481);
        GeoPoint destination = new GeoPoint(120.2704, 31.481);
        List<GeoPoint> polyline = List.of(origin, destination);
        when(provider.isConfigured()).thenReturn(true);
        when(provider.findCandidates(origin, destination)).thenReturn(List.of(
                new RouteCandidate("walk", "步行到达", 40, 30, polyline)));
        seedRealEvidence(polyline);
        String device = "b04-" + UUID.randomUUID();
        JsonNode comparison = compare(device, origin, destination, false);
        assertThat(comparison.path("routeSource").asText()).isEqualTo("REAL");
        assertThat(comparison.path("feedbackSource").asText()).isEqualTo("REAL");
        assertThat(comparison.path("scoringStatus").asText()).isEqualTo("VALID");
        UUID id = UUID.fromString(comparison.path("snapshotId").asText());
        var stored = snapshots.findSnapshotById(id, identities.hash(device)).orElseThrow();
        assertThat(stored.result().scoringVersion()).isEqualTo("walking-distance-v2");
        // Persisted JSON preserves metadata and old JSON remains readable as UNKNOWN, never REAL.
        RouteComparison restored = json.readValue(json.writeValueAsString(stored.result()), RouteComparison.class);
        assertThat(restored.routeSource()).isEqualTo(RouteSource.REAL);
        assertThat(json.readValue("{\"routes\":[],\"recommendAlternative\":false}", RouteComparison.class).routeSource())
                .isEqualTo(RouteSource.UNKNOWN);
        String payload = """
                {"snapshotId":"%s","operationId":"%s","routeId":"walk","endStressLevel":25,
                 "selectedScore":999,"durationMinutes":999}
                """.formatted(id, UUID.randomUUID());
        http.perform(post("/api/v1/commutes/complete").header("X-Device-Id", device)
                        .contentType("application/json").content(payload))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.routeSource").value("REAL"))
                .andExpect(jsonPath("$.estimatedSeconds").value(30))
                .andExpect(jsonPath("$.durationMinutes").value(1))
                .andExpect(jsonPath("$.selectedScore").value(comparison.path("routes").get(0).path("stressScore").asDouble()));
        http.perform(post("/api/v1/commutes/complete").header("X-Device-Id", device)
                        .contentType("application/json").content(payload))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("duplicate"));
        http.perform(post("/api/v1/commutes/complete").header("X-Device-Id", device + "-other")
                        .contentType("application/json").content(payload))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("snapshot_not_found"));
        http.perform(get("/api/v1/commutes/trends").header("X-Device-Id", device))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalCommutes").value(1));
    }

    /**
     * 演示快照可以完成通勤，但结果不进入真实统计（D07 口径修订）。
     *
     * <p>原先这一条断言 422 {@code demo_result_not_allowed}：写入门禁直接拒绝演示结果。
     * 后果是演示模式下"完成通勤"这个动作根本走不通，答辩现场必踩。已确认的口径改为
     * <b>「演示结果可以记录，但在读侧排除」</b>：写入时如实记下 {@code routeSource=DEMO}，
     * 由趋势与历史在读取时排除。所以本用例现在验证的是同一件事的另一半——
     * 记录写进去了（201），但真实统计里看不到它（{@code totalCommutes=0}、
     * {@code excludedDemoCommutes=1}），历史明细里也不出现。
     */
    @Test
    void demoSnapshotIsRecordedButExcludedFromRealCommuteStatistics() throws Exception {
        GeoPoint origin = new GeoPoint(120.27, 31.48);
        GeoPoint destination = new GeoPoint(120.27, 31.485);
        String device = "b04-demo-" + UUID.randomUUID();
        JsonNode comparison = compare(device, origin, destination, true);
        assertThat(comparison.path("routeSource").asText()).isEqualTo("DEMO");
        assertThat(comparison.path("routes").get(0).has("stressScore")).isFalse();
        http.perform(post("/api/v1/commutes/complete").header("X-Device-Id", device)
                        .contentType("application/json").content("""
                                {"snapshotId":"%s","operationId":"%s","routeId":"route-fast","endStressLevel":25}
                                """.formatted(comparison.path("snapshotId").asText(), UUID.randomUUID())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("created"))
                .andExpect(jsonPath("$.routeSource").value("DEMO"))
                // 演示快照没有可验证评分，落库时评分留空而不是补 0
                .andExpect(jsonPath("$.selectedScore").doesNotExist())
                .andExpect(jsonPath("$.fastestScore").doesNotExist());
        // 读侧排除：真实统计与历史明细都看不到这条演示通勤
        http.perform(get("/api/v1/commutes/trends").header("X-Device-Id", device))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCommutes").value(0))
                .andExpect(jsonPath("$.excludedDemoCommutes").value(1));
        http.perform(get("/api/v1/commutes/history").header("X-Device-Id", device))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /**
     * 真实路线但沿途还没有任何反馈：没有评分，但这次通勤不能丢（D07 口径修订）。
     *
     * <p>原先这一条断言 400，等于"真实用户的第一次通勤直接失败"。已确认的口径是
     * <b>不应丢失，但不能补造分数</b>：记录照常写入，评分字段留空（NON_NULL 下整个键不出现），
     * 趋势的均值不会被假零分拉低。
     */
    @Test
    void realRouteWithoutFeedbackHasNoScoresButStillCompletes() throws Exception {
        GeoPoint origin = new GeoPoint(121, 32);
        GeoPoint destination = new GeoPoint(121.001, 32);
        when(provider.isConfigured()).thenReturn(true);
        when(provider.findCandidates(origin, destination)).thenReturn(List.of(
                new RouteCandidate("walk", "步行", 100, 80, List.of(origin, destination))));
        String device = "b04-empty-" + UUID.randomUUID();
        JsonNode comparison = compare(device, origin, destination, false);
        assertThat(comparison.path("scoringStatus").asText()).isEqualTo("INSUFFICIENT_DATA");
        assertThat(comparison.path("routes").get(0).has("stressScore")).isFalse();
        http.perform(post("/api/v1/commutes/complete").header("X-Device-Id", device)
                        .contentType("application/json").content("""
                                {"snapshotId":"%s","operationId":"%s","routeId":"walk","endStressLevel":25}
                                """.formatted(comparison.path("snapshotId").asText(), UUID.randomUUID())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.routeSource").value("REAL"))
                .andExpect(jsonPath("$.estimatedSeconds").value(80))
                .andExpect(jsonPath("$.selectedScore").doesNotExist())
                .andExpect(jsonPath("$.fastestScore").doesNotExist())
                .andExpect(jsonPath("$.confidence").doesNotExist());
        // 来源是 REAL，所以照常计入真实统计；缺评分只影响均值样本，不影响次数
        http.perform(get("/api/v1/commutes/trends").header("X-Device-Id", device))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCommutes").value(1))
                .andExpect(jsonPath("$.unknownSourceCommutes").value(0))
                .andExpect(jsonPath("$.excludedDemoCommutes").value(0));
        http.perform(get("/api/v1/commutes/history").header("X-Device-Id", device))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].selectedScore").doesNotExist())
                .andExpect(jsonPath("$[0].routeSource").value("REAL"));
    }

    private JsonNode compare(String device, GeoPoint origin, GeoPoint destination, boolean demo) throws Exception {
        return json.readTree(http.perform(post("/api/v1/routes/compare").header("X-Device-Id", device)
                        .contentType("application/json").content(json.writeValueAsString(java.util.Map.of(
                                "origin", origin, "destination", destination, "demo", demo))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private void seedRealEvidence(List<GeoPoint> polyline) {
        for (GeoPoint point : GeoMath.sampleEvery(polyline, 25)) {
            for (int i = 0; i < 12; i++) {
                reports.save(new EmotionReport(UUID.randomUUID(), UUID.randomUUID().toString(), point,
                        25, EmotionTag.QUIET, Instant.now(), false));
            }
        }
    }
}
