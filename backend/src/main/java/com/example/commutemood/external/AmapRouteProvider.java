package com.example.commutemood.external;

import com.example.commutemood.config.AppProperties;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteCandidate;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class AmapRouteProvider implements RouteProvider {
    private static final Logger log = LoggerFactory.getLogger(AmapRouteProvider.class);
    private final RestClient restClient;
    private final AppProperties properties;

    public AmapRouteProvider(RestClient.Builder builder, AppProperties properties) {
        this.restClient = builder.baseUrl("https://restapi.amap.com").build();
        this.properties = properties;
    }

    public boolean isConfigured() {
        return properties.amap() != null
                && properties.amap().webKey() != null
                && !properties.amap().webKey().isBlank();
    }

    @Override
    public List<RouteCandidate> findCandidates(GeoPoint origin, GeoPoint destination) {
        log.info("AMap routing: ({},{}) -> ({},{})",
                origin.longitude(), origin.latitude(),
                destination.longitude(), destination.latitude());
        JsonNode root = restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/v3/direction/driving")
                        .queryParam("origin", origin.longitude() + "," + origin.latitude())
                        .queryParam("destination", destination.longitude() + "," + destination.latitude())
                        .queryParam("strategy", 10)
                        .queryParam("extensions", "base")
                        .queryParam("key", properties.amap().webKey())
                        .build())
                .retrieve()
                .body(JsonNode.class);

        if (root == null || !"1".equals(root.path("status").asText())) {
            throw new IllegalStateException("AMap route service returned an error");
        }

        List<RouteCandidate> candidates = new ArrayList<>();
        AtomicInteger index = new AtomicInteger(1);
        for (JsonNode path : root.path("route").path("paths")) {
            List<GeoPoint> polyline = new ArrayList<>();
            for (JsonNode step : path.path("steps")) {
                parsePolyline(step.path("polyline").asText(), polyline);
            }
            int routeNumber = index.getAndIncrement();
            candidates.add(new RouteCandidate(
                    "amap-" + routeNumber,
                    "高德候选路线 " + routeNumber,
                    path.path("distance").asInt(),
                    path.path("duration").asInt(),
                    deduplicate(polyline)));
        }
        if (candidates.isEmpty()) {
            throw new IllegalStateException("AMap returned no route candidates");
        }
        return candidates;
    }

    private void parsePolyline(String encoded, List<GeoPoint> target) {
        if (encoded == null || encoded.isBlank()) {
            return;
        }
        for (String pair : encoded.split(";")) {
            String[] coordinates = pair.split(",");
            if (coordinates.length == 2) {
                target.add(new GeoPoint(
                        Double.parseDouble(coordinates[0]),
                        Double.parseDouble(coordinates[1])));
            }
        }
    }

    private List<GeoPoint> deduplicate(List<GeoPoint> points) {
        List<GeoPoint> result = new ArrayList<>();
        GeoPoint previous = null;
        for (GeoPoint point : points) {
            if (!point.equals(previous)) {
                result.add(point);
                previous = point;
            }
        }
        return result;
    }
}

