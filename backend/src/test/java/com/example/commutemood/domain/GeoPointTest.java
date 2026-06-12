package com.example.commutemood.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GeoPointTest {
    @Test
    void rejectsNonFiniteCoordinates() {
        assertThatThrownBy(() -> new GeoPoint(Double.NaN, 39.9))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new GeoPoint(116.4, Double.POSITIVE_INFINITY))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
