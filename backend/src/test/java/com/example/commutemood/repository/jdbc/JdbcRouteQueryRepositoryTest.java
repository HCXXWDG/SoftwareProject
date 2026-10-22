package com.example.commutemood.repository.jdbc;

import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;

class JdbcRouteQueryRepositoryTest {

    @Test
    void saveUpsertsDeviceProfileThenInsertsRouteQueryAndReturnsSnapshotId() throws Exception {
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

        UUID snapshotId = repository.save("device-hash", origin, destination, comparison);

        assertThat(snapshotId).isNotNull();

        var inOrder = inOrder(jdbcTemplate);
        // 1) device_profile 先于 route_query 落库（外键约束要求父记录存在）
        inOrder.verify(jdbcTemplate).update(
                contains("INSERT INTO device_profile"),
                eq("device-hash"));

        // 2) route_query 显式写入生成的快照 ID，且返回的 ID 与写库 ID 一致
        ArgumentCaptor<UUID> idCaptor = ArgumentCaptor.forClass(UUID.class);
        inOrder.verify(jdbcTemplate).update(
                contains("INSERT INTO route_query"),
                idCaptor.capture(),
                eq("device-hash"),
                eq(origin.longitude()),
                eq(origin.latitude()),
                eq(destination.longitude()),
                eq(destination.latitude()),
                eq(objectMapper.writeValueAsString(comparison)));

        assertThat(idCaptor.getValue()).isEqualTo(snapshotId);
    }
}
