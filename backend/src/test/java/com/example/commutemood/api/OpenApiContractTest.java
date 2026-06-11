package com.example.commutemood.api;

import com.example.commutemood.CommuteMoodApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = CommuteMoodApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("demo")
@TestPropertySource(properties = "spring.profiles.active=demo")
class OpenApiContractTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void exposesStableApiPaths() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/reports'].post").exists())
                .andExpect(jsonPath("$.paths['/api/v1/heatmap'].get").exists())
                .andExpect(jsonPath("$.paths['/api/v1/heatmap/refresh'].post").exists())
                .andExpect(jsonPath("$.paths['/api/v1/routes/compare'].post").exists())
                .andExpect(jsonPath("$.paths['/api/v1/routes/history'].get").exists())
                .andExpect(jsonPath("$.paths['/api/v1/commutes/complete'].post").exists())
                .andExpect(jsonPath("$.paths['/api/v1/commutes/trends'].get").exists());
    }

    @Test
    void documentsCoreRequestAndResponseSchemas() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components.schemas.ReportRequest.description").value("Mood report submitted from the map"))
                .andExpect(jsonPath("$.components.schemas.RouteComparison.properties.fastestRouteId").exists())
                .andExpect(jsonPath("$.components.schemas.RouteComparison.properties.leastStressfulRouteId").exists())
                .andExpect(jsonPath("$.components.schemas.TrendResult.properties.summary").exists())
                .andExpect(jsonPath("$.components.schemas.TrendSummary.properties.direction").exists())
                .andExpect(jsonPath("$.components.schemas.ScoredRoute.properties.polyline").exists());
    }

    @Test
    void documentsDeviceHeaderOnProtectedEndpoints() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/reports'].post.parameters[?(@.name=='X-Device-Id')].required")
                        .value(true))
                .andExpect(jsonPath("$.paths['/api/v1/commutes/trends'].get.parameters[?(@.name=='X-Device-Id')].required")
                        .value(true));
    }
}
