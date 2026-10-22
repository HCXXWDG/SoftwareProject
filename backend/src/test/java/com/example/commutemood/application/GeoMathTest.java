package com.example.commutemood.application;

import com.example.commutemood.domain.GeoPoint;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.ArrayList;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class GeoMathTest {
    private final GeoPoint start = new GeoPoint(120, 31);
    private final GeoPoint end = new GeoPoint(120.01, 31);

    @Test
    void insertingCollinearVerticesDoesNotRestartTheSamplingInterval() {
        List<GeoPoint> dense = new ArrayList<>();
        for (int index = 0; index <= 100; index++) {
            dense.add(new GeoPoint(120 + index * 0.0001, 31));
        }
        var sparseSamples = GeoMath.sampleEvery(List.of(start, end), 50);
        var denseSamples = GeoMath.sampleEvery(dense, 50);
        assertThat(denseSamples).hasSize(sparseSamples.size());
        for (int index = 0; index < denseSamples.size(); index++) {
            assertThat(GeoMath.distanceMeters(denseSamples.get(index), sparseSamples.get(index))).isLessThan(0.001);
        }
        assertThat(denseSamples.get(denseSamples.size() - 1)).isEqualTo(end);
    }

    @Test
    void repeatedPointsAndEmptyPathsAreSafe() {
        assertThat(GeoMath.sampleEvery(List.of(), 50)).isEmpty();
        assertThat(GeoMath.sampleEvery(List.of(start, start, start), 50)).containsExactly(start);
        assertThat(GeoMath.sampleEvery(List.of(start, start, end, end), 50))
                .isEqualTo(GeoMath.sampleEvery(List.of(start, end), 50));
    }

    @ParameterizedTest
    @ValueSource(doubles = {0, -1, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY})
    void rejectsInvalidIntervals(double interval) {
        assertThatThrownBy(() -> GeoMath.sampleEvery(List.of(start, end), interval))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void antipodalDistanceRemainsFinite() {
        assertThat(GeoMath.distanceMeters(new GeoPoint(0, 0), new GeoPoint(180, 0))).isFinite();
    }
}
