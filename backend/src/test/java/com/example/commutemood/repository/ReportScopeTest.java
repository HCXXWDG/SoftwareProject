package com.example.commutemood.repository;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ReportScopeTest {

    @Test
    void realOnlyAcceptsOnlyNonSimulatedRecords() {
        assertThat(ReportScope.REAL_ONLY.matches(false)).isTrue();
        assertThat(ReportScope.REAL_ONLY.matches(true)).isFalse();
    }

    @Test
    void simulatedOnlyAcceptsOnlySeedRecords() {
        assertThat(ReportScope.SIMULATED_ONLY.matches(true)).isTrue();
        assertThat(ReportScope.SIMULATED_ONLY.matches(false)).isFalse();
    }

    @Test
    void allAcceptsBothSourcesForDemoMode() {
        assertThat(ReportScope.ALL.matches(true)).isTrue();
        assertThat(ReportScope.ALL.matches(false)).isTrue();
    }
}
