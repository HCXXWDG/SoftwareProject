package com.example.commutemood.api;

import com.example.commutemood.CommuteMoodApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = CommuteMoodApplication.class)
@AutoConfigureMockMvc
class ApiSmokeTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void servesHeatmapFromDemoSeed() throws Exception {
        mockMvc.perform(get("/api/v1/heatmap")
                        .param("bbox", "116.39,39.90,116.41,39.92")
                        .param("zoom", "16")
                        .param("hours", "168"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].cellId").exists());
    }

    @Test
    void comparesRoutesWithoutAmapKey() throws Exception {
        mockMvc.perform(post("/api/v1/routes/compare")
                        .contentType("application/json")
                        .content("""
                                {
                                  "origin":{"longitude":116.392,"latitude":39.905},
                                  "destination":{"longitude":116.405,"latitude":39.912}
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.routes.length()").value(3))
                .andExpect(jsonPath("$.recommendation").exists());
    }
}

