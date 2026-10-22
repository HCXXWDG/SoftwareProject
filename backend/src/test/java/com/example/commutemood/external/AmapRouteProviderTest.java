package com.example.commutemood.external;

import com.example.commutemood.config.AppProperties;
import com.example.commutemood.domain.GeoPoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.net.SocketTimeoutException;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class AmapRouteProviderTest {
    private static final GeoPoint ORIGIN = new GeoPoint(120.26894, 31.477278);
    private static final GeoPoint DESTINATION = new GeoPoint(120.269748, 31.485223);
    private MockRestServiceServer server;
    private AmapRouteProvider provider;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://restapi.amap.com");
        server = MockRestServiceServer.bindTo(builder).build();
        provider = new AmapRouteProvider(builder.build(),
                new AppProperties("test", new AppProperties.Amap("test-only-key"), ""));
    }

    @Test
    void usesWalkingEndpointWithoutDrivingParametersAndKeepsSingleCandidate() {
        server.expect(request -> {
            var uri = request.getURI();
            assertThat(uri.getPath()).isEqualTo("/v3/direction/walking");
            assertThat(uri.getQuery()).contains("origin=120.268940,31.477278", "output=JSON")
                    .doesNotContain("strategy", "extensions");
        }).andRespond(withSuccess(response(validPath()), MediaType.APPLICATION_JSON));
        var routes = provider.findCandidates(ORIGIN, DESTINATION);
        assertThat(routes).hasSize(1);
        assertThat(routes.get(0).durationSeconds()).isEqualTo(600);
        assertThat(routes.get(0).polyline()).hasSize(2);
        server.verify();
    }

    @Test
    void emptyPathsMeanNoRouteRatherThanAnInventedAlternative() {
        server.expect(requestTo(org.hamcrest.Matchers.any(String.class)))
                .andRespond(withSuccess(response(""), MediaType.APPLICATION_JSON));
        assertThat(provider.findCandidates(ORIGIN, DESTINATION)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "NaN", "1.5", "2147483648", ""})
    void rejectsInvalidPositiveIntegers(String duration) {
        String badPath = validPath().replace("\"duration\":\"600\"", "\"duration\":\"" + duration + "\"");
        server.expect(requestTo(org.hamcrest.Matchers.any(String.class)))
                .andRespond(withSuccess(response(badPath), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.findCandidates(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "120,31;bad", "NaN,31;120,32", "181,31;120,32", "120,31", "120,31;120,31"})
    void rejectsMalformedAndDegeneratePolylines(String polyline) {
        String path = validPath().replace("120.26894,31.477278;120.269748,31.485223", polyline);
        server.expect(requestTo(org.hamcrest.Matchers.any(String.class)))
                .andRespond(withSuccess(response(path), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.findCandidates(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class);
    }

    @Test
    void keepsValidCandidateWhenAnotherIsMalformed() {
        server.expect(requestTo(org.hamcrest.Matchers.any(String.class)))
                .andRespond(withSuccess(response("{}," + validPath()), MediaType.APPLICATION_JSON));
        assertThat(provider.findCandidates(ORIGIN, DESTINATION)).hasSize(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"status\":\"0\"}", "{}", "{\"status\":\"1\",\"route\":{\"paths\":{}}}", "<html>oops</html>"})
    void rejectsExternalErrorsAndUnexpectedStructures(String body) {
        server.expect(requestTo(org.hamcrest.Matchers.any(String.class)))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.findCandidates(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class).hasMessageNotContaining("test-only-key");
    }

    @Test
    void transportFailureIsSanitizedAndNeverLeaksRequestUri() {
        server.expect(requestTo(org.hamcrest.Matchers.any(String.class)))
                .andRespond(withException(new SocketTimeoutException("uri?key=test-only-key")));
        assertThatThrownBy(() -> provider.findCandidates(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class).hasMessageNotContaining("test-only-key")
                .hasCause(null);
    }

    private static String response(String paths) {
        return "{\"status\":\"1\",\"route\":{\"paths\":[" + paths + "]}}";
    }

    private static String validPath() {
        return "{\"distance\":\"800\",\"duration\":\"600\",\"steps\":[{\"polyline\":\"120.26894,31.477278;120.269748,31.485223\"}]}";
    }
}
