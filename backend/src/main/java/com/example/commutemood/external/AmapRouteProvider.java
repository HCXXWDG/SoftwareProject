package com.example.commutemood.external;

import com.example.commutemood.config.AppProperties;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteCandidate;
import com.example.commutemood.domain.RouteCandidateValidator;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Component
public class AmapRouteProvider implements RouteProvider {
    private final RestClient restClient;
    private final AppProperties properties;

    @org.springframework.beans.factory.annotation.Autowired
    public AmapRouteProvider(RestClient.Builder builder, AppProperties properties) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(5));
        this.restClient = builder.baseUrl("https://restapi.amap.com").requestFactory(factory).build();
        this.properties = properties;
    }

    AmapRouteProvider(RestClient restClient, AppProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    public boolean isConfigured() {
        return properties.amap() != null && properties.amap().webKey() != null
                && !properties.amap().webKey().isBlank();
    }

    @Override
    public List<RouteCandidate> findCandidates(GeoPoint origin, GeoPoint destination) {
        if (!isConfigured()) {
            throw new RouteProviderException();
        }
        try {
            JsonNode root = restClient.get().uri(uri -> uri.path("/v3/direction/walking")
                    .queryParam("origin", coordinate(origin))
                    .queryParam("destination", coordinate(destination))
                    .queryParam("output", "JSON")
                    .queryParam("key", properties.amap().webKey()).build())
                    .retrieve().body(JsonNode.class);
            if (root == null || !"1".equals(root.path("status").asText())
                    || !root.path("route").path("paths").isArray()) {
                throw new RouteProviderException();
            }
            List<RouteCandidate> candidates = new ArrayList<>();
            JsonNode paths = root.path("route").path("paths");
            for (int index = 0; index < paths.size(); index++) {
                try {
                    JsonNode path = paths.get(index);
                    if (!path.path("steps").isArray()) {
                        continue;
                    }
                    List<GeoPoint> polyline = new ArrayList<>();
                    for (JsonNode step : path.path("steps")) {
                        parsePolyline(step.path("polyline").asText(), polyline);
                    }
                    RouteCandidate candidate = new RouteCandidate("amap-" + (index + 1),
                            "步行路线 " + (index + 1), positiveInt(path.path("distance")),
                            positiveInt(path.path("duration")), List.copyOf(polyline));
                    if (RouteCandidateValidator.isValid(candidate)) {
                        candidates.add(candidate);
                    }
                } catch (IllegalArgumentException ignored) {
                    // Reject a malformed candidate without losing other valid alternatives.
                }
            }
            if (!paths.isEmpty() && candidates.isEmpty()) {
                throw new RouteProviderException();
            }
            return List.copyOf(candidates);
        } catch (RuntimeException exception) {
            throw new RouteProviderException();
        }
    }

    private static String coordinate(GeoPoint point) {
        return String.format(Locale.ROOT, "%.6f,%.6f", point.longitude(), point.latitude());
    }

    private static int positiveInt(JsonNode value) {
        int parsed = Integer.parseInt(value.asText());
        if (parsed <= 0) {
            throw new IllegalArgumentException("Route distance and duration must be positive");
        }
        return parsed;
    }

    private static void parsePolyline(String encoded, List<GeoPoint> target) {
        if (encoded == null || encoded.isBlank()) {
            throw new IllegalArgumentException("Missing walking polyline");
        }
        for (String pair : encoded.split(";", -1)) {
            String[] coordinates = pair.split(",", -1);
            if (coordinates.length != 2) {
                throw new IllegalArgumentException("Invalid walking coordinate");
            }
            GeoPoint point = new GeoPoint(Double.parseDouble(coordinates[0]),
                    Double.parseDouble(coordinates[1]));
            if (target.isEmpty() || !point.equals(target.get(target.size() - 1))) {
                target.add(point);
            }
        }
    }
}
