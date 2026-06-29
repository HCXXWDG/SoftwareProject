package com.example.commutemood.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GeoBoundsTest {
    @Test
    void rejectsNonFiniteBounds() {
        assertThatThrownBy(() -> new GeoBounds(Double.NaN, 39.9, 116.5, 40.0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsOutOfRangeBounds() {
        assertThatThrownBy(() -> new GeoBounds(-181, 39.9, 116.5, 40.0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new GeoBounds(116.3, -91, 116.5, 40.0))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
