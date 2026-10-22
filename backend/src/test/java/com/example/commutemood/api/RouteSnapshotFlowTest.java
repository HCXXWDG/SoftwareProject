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

    @Test
    void demoSnapshotCannotEnterRealCommuteStatistics() throws Exception {
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
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("demo_result_not_allowed"));
        http.perform(get("/api/v1/commutes/trends").header("X-Device-Id", device))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalCommutes").value(0));
    }

    @Test
    void realRouteWithoutFeedbackHasNoScoresAndCannotComplete() throws Exception {
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
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_request"));
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
