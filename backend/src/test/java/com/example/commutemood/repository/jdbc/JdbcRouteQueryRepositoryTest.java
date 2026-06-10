package com.example.commutemood.repository.jdbc;

import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;

class JdbcRouteQueryRepositoryTest {
    @Test
    void saveUpsertsDeviceProfileBeforeRouteQuery() throws Exception {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        ObjectMapper objectMapper = new ObjectMapper();
        JdbcRouteQueryRepository repository = new JdbcRouteQueryRepository(jdbcTemplate, objectMapper);
        GeoPoint origin = new GeoPoint(116.392, 39.905);
        GeoPoint destination = new GeoPoint(116.405, 39.912);
        RouteComparison comparison = new RouteComparison(
                List.of(),
                "route-fast",
                "route-calm",
                "ok",
                false);

        repository.save("device-hash", origin, destination, comparison);

        var inOrder = inOrder(jdbcTemplate);
        inOrder.verify(jdbcTemplate).update(
                contains("INSERT INTO device_profile"),
                eq("device-hash"));
        inOrder.verify(jdbcTemplate).update(
                contains("INSERT INTO route_query"),
                eq("device-hash"),
                eq(origin.longitude()),
                eq(origin.latitude()),
                eq(destination.longitude()),
                eq(destination.latitude()),
                eq(objectMapper.writeValueAsString(comparison)));
    }
}
