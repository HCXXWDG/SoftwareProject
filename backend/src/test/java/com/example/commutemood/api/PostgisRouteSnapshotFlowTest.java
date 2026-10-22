package com.example.commutemood.api;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoPoint;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Run the same compare -> snapshot -> complete contract against JDBC, not only memory. */
@ActiveProfiles("postgres")
@Testcontainers(disabledWithoutDocker = true)
@Transactional
class PostgisRouteSnapshotFlowTest extends RouteSnapshotFlowTest {
    @Container
    static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
        registry.add("spring.datasource.username", DATABASE::getUsername);
        registry.add("spring.datasource.password", DATABASE::getPassword);
    }

    @Test
    void postgresDefaultAndCacheRemainRealOnlyWhileExplicitAllLabelsMixedCells() throws Exception {
        GeoPoint point = new GeoPoint(123.01, 32);
        String bbox = "123.009,31.999,123.011,32.001";
        reports.save(new EmotionReport(UUID.randomUUID(), identities.hash("pg-scope-real"),
                point, 25, EmotionTag.QUIET, Instant.now(), false));
        reports.save(new EmotionReport(UUID.randomUUID(), identities.hash("pg-scope-demo"),
                point, 100, EmotionTag.NOISE, Instant.now(), true));
        http.perform(get("/api/v1/heatmap").param("bbox", bbox))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].count").value(1))
                .andExpect(jsonPath("$[0].feedbackSource").value("REAL"));
        http.perform(get("/api/v1/heatmap").param("bbox", bbox).param("scope", "ALL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].count").value(2))
                .andExpect(jsonPath("$[0].feedbackSource").value("MIXED"));
        http.perform(post("/api/v1/heatmap/refresh").param("bbox", bbox))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].count").value(1))
                .andExpect(jsonPath("$[0].feedbackSource").value("REAL"));
    }
}
