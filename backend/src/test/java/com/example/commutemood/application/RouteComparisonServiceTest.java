package com.example.commutemood.application;

import com.example.commutemood.config.AppProperties;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;
import com.example.commutemood.external.AmapRouteProvider;
import com.example.commutemood.external.MockRouteProvider;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.HeatmapCellRepository;
import com.example.commutemood.repository.RouteQueryRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RouteComparisonServiceTest {
    private final AmapRouteProvider amapRouteProvider = mock(AmapRouteProvider.class);
    private final EmotionReportRepository emotionReportRepository = mock(EmotionReportRepository.class);
    private final RouteQueryRepository routeQueryRepository = mock(RouteQueryRepository.class);
    private final DeviceIdentityService identityService = new DeviceIdentityService(
            new AppProperties("test-salt", new AppProperties.Amap(""), List.of("http://localhost:5173")));
    private final RouteComparisonService service = new RouteComparisonService(
            amapRouteProvider,
            new MockRouteProvider(),
            new HeatmapService(emotionReportRepository, mock(HeatmapCellRepository.class)),
            new WeightedStressRouteScoringStrategy(),
            identityService,
            routeQueryRepository);

    @Test
    void storesRouteQueryWhenDeviceIdIsProvided() {
        when(amapRouteProvider.isConfigured()).thenReturn(false);
        when(emotionReportRepository.findWithin(any(), any())).thenReturn(List.of());
        GeoPoint origin = new GeoPoint(116.392, 39.905);
        GeoPoint destination = new GeoPoint(116.405, 39.912);

        RouteComparison comparison = service.compare("demo-browser", origin, destination);

        assertThat(comparison.routes()).hasSize(3);
        assertThat(comparison.fastestRouteId()).isEqualTo("route-fast");
        assertThat(comparison.leastStressfulRouteId()).isEqualTo("route-calm");
        assertThat(comparison.fastestRouteId()).isNotEqualTo(comparison.leastStressfulRouteId());
        verify(routeQueryRepository).save(
                eq(identityService.hash("demo-browser")),
                eq(origin),
                eq(destination),
                eq(comparison));
    }

    @Test
    void skipsRouteQueryStorageWhenDeviceIdIsMissing() {
        when(amapRouteProvider.isConfigured()).thenReturn(false);
        when(emotionReportRepository.findWithin(any(), any())).thenReturn(List.of());

        service.compare(null, new GeoPoint(116.392, 39.905), new GeoPoint(116.405, 39.912));

        verify(routeQueryRepository, never()).save(any(), any(), any(), any());
    }

    @Test
    void readsRouteQueryHistoryForHashedDevice() {
        RouteQueryHistory history = new RouteQueryHistory(
                UUID.randomUUID(),
                new GeoPoint(116.392, 39.905),
                new GeoPoint(116.405, 39.912),
                new RouteComparison(List.of(), "route-fast", "route-calm", "ok", false),
                Instant.now());
        when(routeQueryRepository.findRecent(identityService.hash("demo-browser"), 5))
                .thenReturn(List.of(history));

        List<RouteQueryHistory> result = service.getHistory("demo-browser", 5);

        assertThat(result).containsExactly(history);
    }
}
