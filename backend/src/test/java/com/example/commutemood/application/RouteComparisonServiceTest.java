package com.example.commutemood.application;

import com.example.commutemood.config.AppProperties;
import com.example.commutemood.config.RoutePolicy;
import com.example.commutemood.domain.*;
import com.example.commutemood.external.AmapRouteProvider;
import com.example.commutemood.external.MockRouteProvider;
import com.example.commutemood.repository.ReportScope;
import com.example.commutemood.repository.RouteQueryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RouteComparisonServiceTest {
    private static final GeoPoint ORIGIN = new GeoPoint(120.27, 31.48);
    private static final GeoPoint DESTINATION = new GeoPoint(120.27, 31.485);
    private final AmapRouteProvider provider = mock(AmapRouteProvider.class);
    private final HeatmapService heatmap = mock(HeatmapService.class);
    private final RouteScoringStrategy scoring = mock(RouteScoringStrategy.class);
    private final RouteQueryRepository snapshots = mock(RouteQueryRepository.class);
    private final DeviceIdentityService identity = new DeviceIdentityService(
            new AppProperties("test-salt", new AppProperties.Amap(""), ""));
    private final UUID snapshotId = UUID.randomUUID();
    private RouteComparisonService service;

    @BeforeEach
    void setUp() {
        service = service(false);
        when(provider.isConfigured()).thenReturn(true);
        when(provider.findCandidates(ORIGIN, DESTINATION)).thenReturn(List.of(candidate("fast", 600), candidate("calm", 660)));
        when(heatmap.getRouteScoringCells(any(), eq(16), eq(168), eq(ReportScope.REAL_ONLY)))
                .thenReturn(List.of(new HeatmapCell("real", ORIGIN, 30, 1, 20,
                        EmotionTag.QUIET, FeedbackSource.REAL, java.time.Instant.now(), 168)));
        when(heatmap.getRouteScoringCells(any(), eq(16), eq(168), eq(ReportScope.SIMULATED_ONLY))).thenReturn(List.of());
        when(scoring.score(any(), anyInt(), anyList(), anyBoolean())).thenAnswer(invocation -> {
            RouteCandidate route = invocation.getArgument(0);
            double value = route.id().equals("fast") ? 65 : 35;
            return new ScoredRoute(route.id(), route.label(), route.distanceMeters(), route.durationSeconds(),
                    value, value, 0.8, invocation.getArgument(3), false, route.polyline());
        });
        when(snapshots.save(anyString(), any(), any(), any())).thenReturn(snapshotId);
    }

    @Test
    void savesDeviceOwnedVersionedComparisonAndReturnsRepositoryId() {
        RouteComparison comparison = service.compare("device", ORIGIN, DESTINATION);
        assertThat(comparison.snapshotId()).isEqualTo(snapshotId);
        assertThat(comparison.routeSource()).isEqualTo(RouteSource.REAL);
        assertThat(comparison.feedbackSource()).isEqualTo(FeedbackSource.REAL);
        assertThat(comparison.scoringStatus()).isEqualTo(ScoringStatus.VALID);
        assertThat(comparison.scoringVersion()).isEqualTo(WeightedStressRouteScoringStrategy.VERSION);
        assertThat(comparison.travelMode()).isEqualTo("WALKING");
        assertThat(comparison.recommendationReason()).isEqualTo(RecommendationReason.RECOMMENDED);
        assertThat(comparison.recommendation()).doesNotContain("明天");
        assertThat(comparison.recommendationDetails().extraDurationSeconds()).isEqualTo(60);
        verify(snapshots).save(eq(identity.hash("device")), eq(ORIGIN), eq(DESTINATION),
                eq(comparison.withSnapshotId(null)));
        verify(heatmap).getRouteScoringCells(any(), eq(16), eq(168), eq(ReportScope.REAL_ONLY));
    }

    @Test
    void anonymousComparisonHasNoCompletableSnapshot() {
        assertThat(service.compare(ORIGIN, DESTINATION).snapshotId()).isNull();
        verifyNoInteractions(snapshots);
    }

    @Test
    void failedOrNullSnapshotSaveCannotReturnAnEffectiveId() {
        when(snapshots.save(any(), any(), any(), any())).thenThrow(new IllegalStateException("storage failed"));
        assertThatThrownBy(() -> service.compare("device", ORIGIN, DESTINATION)).isInstanceOf(IllegalStateException.class);
        doReturn(null).when(snapshots).save(any(), any(), any(), any());
        assertThatThrownBy(() -> service.compare("device", ORIGIN, DESTINATION)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void singleCandidateIsNeverPadded() {
        when(provider.findCandidates(ORIGIN, DESTINATION)).thenReturn(List.of(candidate("fast", 600)));
        var result = service.compare(ORIGIN, DESTINATION);
        assertThat(result.routes()).hasSize(1);
        assertThat(result.recommendationReason()).isEqualTo(RecommendationReason.NO_ALTERNATIVE);
    }

    @Test
    void emptyAndInvalidCandidatesReturnNoRouteAndAreNeverScored() {
        when(provider.findCandidates(ORIGIN, DESTINATION)).thenReturn(List.of());
        assertThat(service.compare(ORIGIN, DESTINATION).recommendationReason()).isEqualTo(RecommendationReason.NO_ROUTE);
        when(provider.findCandidates(ORIGIN, DESTINATION)).thenReturn(java.util.Arrays.asList(null,
                new RouteCandidate("bad", "bad", 100, 0, List.of()),
                new RouteCandidate("wrong", "wrong", 100, 50, List.of(new GeoPoint(116, 39), DESTINATION))));
        assertThat(service.compare(ORIGIN, DESTINATION).routes()).isEmpty();
        verifyNoInteractions(scoring, snapshots);
    }

    @Test
    void realServiceFailureDoesNotSilentlySwitchToDemoEvenWhenDemoIsEnabled() {
        service = service(true);
        when(provider.findCandidates(ORIGIN, DESTINATION)).thenThrow(new IllegalStateException("upstream failed"));
        var result = service.compare(ORIGIN, DESTINATION);
        assertThat(result.routeSource()).isEqualTo(RouteSource.UNAVAILABLE);
        assertThat(result.recommendationReason()).isEqualTo(RecommendationReason.SERVICE_UNAVAILABLE);
        assertThat(result.routes()).isEmpty();
    }

    @Test
    void noKeyAndProductionPolicyDoesNotInventRoutes() {
        when(provider.isConfigured()).thenReturn(false);
        assertThat(service.compare(ORIGIN, DESTINATION).routes()).isEmpty();
        assertThatThrownBy(() -> service.compare(null, ORIGIN, DESTINATION, true)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void explicitlyEnabledDemoIsLabelledAndNeverReturnsScoresOrComfortBadges() {
        var result = service(true).compare("device", ORIGIN, DESTINATION, true);
        assertThat(result.routeSource()).isEqualTo(RouteSource.DEMO);
        assertThat(result.scoringStatus()).isEqualTo(ScoringStatus.UNAVAILABLE);
        assertThat(result.recommendationReason()).isEqualTo(RecommendationReason.DEMO_ONLY);
        assertThat(result.leastStressfulRouteId()).isNull();
        assertThat(result.routes()).allSatisfy(route -> {
            assertThat(route.stressScore()).isNull();
            assertThat(route.stressExposure()).isNull();
            assertThat(route.leastStressful()).isFalse();
            assertThat(GeoMath.distanceMeters(route.polyline().get(0), ORIGIN)).isLessThan(1);
            assertThat(route.distanceMeters()).isLessThan(2000);
        });
    }

    @Test
    void simulatedOrMissingFeedbackCannotBecomeValidRealRecommendation() {
        when(heatmap.getRouteScoringCells(any(), eq(16), eq(168), eq(ReportScope.REAL_ONLY)))
                .thenReturn(List.of(new HeatmapCell("simulated", ORIGIN, 0, 1, 20,
                        EmotionTag.QUIET, FeedbackSource.DEMO, java.time.Instant.now(), 168)));
        var result = service.compare(ORIGIN, DESTINATION);
        assertThat(result.scoringStatus()).isEqualTo(ScoringStatus.INSUFFICIENT_DATA);
        assertThat(result.recommendationReason()).isEqualTo(RecommendationReason.INSUFFICIENT_DATA);
        assertThat(result.recommendAlternative()).isFalse();
        assertThat(result.routes()).allSatisfy(route -> assertThat(route.stressScore()).isNull());
        when(heatmap.getRouteScoringCells(any(), anyInt(), anyInt(), any())).thenReturn(List.of());
        assertThat(service.compare(ORIGIN, DESTINATION).feedbackSource()).isEqualTo(FeedbackSource.NONE);
    }

    @Test
    void fastestAndCalmestCanBeSameRoute() {
        when(provider.findCandidates(ORIGIN, DESTINATION)).thenReturn(List.of(candidate("calm", 600), candidate("fast", 660)));
        assertThat(service.compare(ORIGIN, DESTINATION).recommendationReason()).isEqualTo(RecommendationReason.SAME_ROUTE);
    }

    @Test
    void largeDetourHasItsOwnReasonAndIsNotDiscardedBeforeExplanation() {
        when(provider.findCandidates(ORIGIN, DESTINATION)).thenReturn(List.of(candidate("fast", 600), candidate("calm", 900)));
        assertThat(service.compare(ORIGIN, DESTINATION).recommendationReason()).isEqualTo(RecommendationReason.DETOUR_TOO_LONG);
    }

    @Test
    void smallImprovementHasItsOwnReason() {
        when(provider.findCandidates(ORIGIN, DESTINATION)).thenReturn(List.of(candidate("a", 600), candidate("b", 660)));
        doAnswer(invocation -> {
            RouteCandidate route = invocation.getArgument(0);
            double score = route.id().equals("a") ? 40 : 35;
            return new ScoredRoute(route.id(), route.label(), 600, route.durationSeconds(), score, score, 0.8,
                    invocation.getArgument(3), false, route.polyline());
        }).when(scoring).score(any(), anyInt(), anyList(), anyBoolean());
        assertThat(service.compare(ORIGIN, DESTINATION).recommendationReason()).isEqualTo(RecommendationReason.DIFFERENCE_TOO_SMALL);
    }

    @Test
    void coincidentEndpointsAreRejectedBeforeCallingExternalService() {
        assertThatThrownBy(() -> service.compare(ORIGIN, ORIGIN)).isInstanceOf(IllegalArgumentException.class);
        verify(provider, never()).findCandidates(any(), any());
    }

    @Test
    void endpointSnappingToleranceIsConfigurable() {
        GeoPoint snapped = new GeoPoint(120.2705, 31.48);
        when(provider.findCandidates(ORIGIN, DESTINATION)).thenReturn(List.of(
                new RouteCandidate("snap", "道路吸附", 700, 600, List.of(snapped, DESTINATION))));
        assertThat(service.compare(ORIGIN, DESTINATION).routes()).hasSize(1);
        service = new RouteComparisonService(provider, new MockRouteProvider(), heatmap, scoring, identity,
                snapshots, new RoutePolicy(false, 10));
        assertThat(service.compare(ORIGIN, DESTINATION).routes()).isEmpty();
    }

    @Test
    void zeroScoreIsPreservedWhenEvidenceAndScoringAreValid() {
        doAnswer(invocation -> {
            RouteCandidate route = invocation.getArgument(0);
            return new ScoredRoute(route.id(), route.label(), 700, route.durationSeconds(), 0, 0, 1,
                    invocation.getArgument(3), false, route.polyline());
        }).when(scoring).score(any(), anyInt(), anyList(), anyBoolean());
        var result = service.compare(ORIGIN, DESTINATION);
        assertThat(result.scoringStatus()).isEqualTo(ScoringStatus.VALID);
        assertThat(result.routes().get(0).stressScore()).isZero();
    }

    @Test
    void readsHistoryForSameHashedDeviceAndRejectsInvalidLimit() {
        when(snapshots.findRecent(identity.hash("device"), 5)).thenReturn(List.of());
        assertThat(service.getHistory("device", 5)).isEmpty();
        verify(snapshots).findRecent(identity.hash("device"), 5);
        assertThatThrownBy(() -> service.getHistory("device", 51)).isInstanceOf(IllegalArgumentException.class);
    }

    private RouteComparisonService service(boolean demo) {
        return new RouteComparisonService(provider, new MockRouteProvider(), heatmap, scoring, identity, snapshots,
                new RoutePolicy(demo, 150));
    }

    private static RouteCandidate candidate(String id, int seconds) {
        return new RouteCandidate(id, "路线 " + id, 700, seconds, List.of(ORIGIN, DESTINATION));
    }
}
