package com.example.commutemood.config;

import jakarta.servlet.Filter;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class WebConfigurationTest {
    private final Filter filter = new WebConfiguration(new AppProperties("test", new AppProperties.Amap(""),
            "https://xintu.example.test,http://127.0.0.1:5173")).corsFilter().getFilter();

    @ParameterizedTest
    @ValueSource(strings = {"http://localhost", "http://localhost:5412", "capacitor://localhost",
            "https://xintu.example.test", "http://127.0.0.1:5173"})
    void permitsConfiguredOriginsAndExactLocalAppHosts(String origin) throws Exception {
        MockHttpServletResponse response = preflight(origin);
        assertThat(response.getHeader("Access-Control-Allow-Origin")).isEqualTo(origin);
        assertThat(response.getHeader("Vary")).isEqualTo("Origin");
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://localhost.attacker.test", "capacitor://localhost.attacker.test",
            "http://localhost@attacker.test", "http://attacker.test@localhost", "http://localhost/path",
            "http://localhost?host=attacker.test", "http://localhost#fragment", "http://localhost:65536",
            "https://unlisted.example.test", "null", "http://[invalid"})
    void doesNotGrantCorsToLookalikeHostsOrMalformedOrigins(String origin) throws Exception {
        assertThat(preflight(origin).getHeader("Access-Control-Allow-Origin")).isNull();
    }

    private MockHttpServletResponse preflight(String origin) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/v1/reports");
        request.addHeader("Origin", origin);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
