package com.example.commutemood.api;

import com.example.commutemood.application.DeviceIdentityService;
import com.example.commutemood.external.AmapRouteProvider;
import com.example.commutemood.external.RouteProviderException;
import com.example.commutemood.repository.RouteQueryRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "app.routing.demo-enabled=false")
@AutoConfigureMockMvc
class RouteAvailabilityApiTest {
    @Autowired MockMvc http;
    @Autowired RouteQueryRepository snapshots;
    @Autowired DeviceIdentityService identities;
    @MockitoBean AmapRouteProvider provider;

    @Test
    void missingProviderConfigurationReturns503NotAnEmptySuccess() throws Exception {
        when(provider.isConfigured()).thenReturn(false);
        expectUnavailableWithoutSnapshot();
    }

    @Test
    void upstreamFailureReturnsSanitized503() throws Exception {
        when(provider.isConfigured()).thenReturn(true);
        when(provider.findCandidates(any(), any())).thenThrow(new RouteProviderException());
        expectUnavailableWithoutSnapshot();
    }

    @Test
    void unexpectedProviderFailureDoesNotLeakItsMessage() throws Exception {
        when(provider.isConfigured()).thenReturn(true);
        when(provider.findCandidates(any(), any())).thenThrow(
                new IllegalStateException("upstream-uri-with-test-only-key"));
        expectUnavailableWithoutSnapshot();
    }

    @Test
    void genuineNoRouteRemains200AndDoesNotCreateSnapshot() throws Exception {
        when(provider.isConfigured()).thenReturn(true);
        when(provider.findCandidates(any(), any())).thenReturn(List.of());
        String device = UUID.randomUUID().toString();
        compare(device).andExpect(status().isOk())
                .andExpect(jsonPath("$.routes").isEmpty())
                .andExpect(jsonPath("$.recommendationReason").value("NO_ROUTE"))
                .andExpect(jsonPath("$.snapshotId").doesNotExist());
        assertThat(snapshots.findRecent(identities.hash(device), 10)).isEmpty();
    }

    private void expectUnavailableWithoutSnapshot() throws Exception {
        String device = UUID.randomUUID().toString();
        compare(device).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value(503))
                .andExpect(jsonPath("$.code").value("route_provider_unavailable"))
                .andExpect(jsonPath("$.message").isNotEmpty())
                .andExpect(jsonPath("$.timestamp").exists())
                .andExpect(jsonPath("$.snapshotId").doesNotExist())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("test-only-key"))));
        assertThat(snapshots.findRecent(identities.hash(device), 10)).isEmpty();
    }

    private ResultActions compare(String device) throws Exception {
        return http.perform(post("/api/v1/routes/compare").header("X-Device-Id", device)
                .contentType("application/json").content("""
                        {"origin":{"longitude":120.27,"latitude":31.48},
                         "destination":{"longitude":120.27,"latitude":31.485}}
                        """));
    }
}
