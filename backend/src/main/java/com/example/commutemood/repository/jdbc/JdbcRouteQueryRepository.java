package com.example.commutemood.repository.jdbc;

import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;
import com.example.commutemood.repository.RouteQueryRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
@Profile("postgres")
public class JdbcRouteQueryRepository implements RouteQueryRepository {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcRouteQueryRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void save(String deviceHash, GeoPoint origin, GeoPoint destination, RouteComparison comparison) {
        jdbcTemplate.update("""
                        INSERT INTO device_profile(device_hash)
                        VALUES (?)
                        ON CONFLICT (device_hash)
                        DO UPDATE SET last_seen_at = now()
                        """, deviceHash);
        jdbcTemplate.update("""
                        INSERT INTO route_query(device_hash, origin, destination, result_json)
                        VALUES (
                            ?,
                            ST_SetSRID(ST_MakePoint(?, ?), 4326),
                            ST_SetSRID(ST_MakePoint(?, ?), 4326),
                            CAST(? AS jsonb)
                        )
                        """,
                deviceHash,
                origin.longitude(), origin.latitude(),
                destination.longitude(), destination.latitude(),
                toJson(comparison));
    }

    @Override
    public List<RouteQueryHistory> findRecent(String deviceHash, int limit) {
        return jdbcTemplate.query("""
                        SELECT id,
                               ST_X(origin) AS origin_longitude,
                               ST_Y(origin) AS origin_latitude,
                               ST_X(destination) AS destination_longitude,
                               ST_Y(destination) AS destination_latitude,
                               result_json::text AS result_json,
                               created_at
                        FROM route_query
                        WHERE device_hash = ?
                        ORDER BY created_at DESC
                        LIMIT ?
                        """,
                (rs, rowNum) -> new RouteQueryHistory(
                        rs.getObject("id", java.util.UUID.class),
                        new GeoPoint(rs.getDouble("origin_longitude"), rs.getDouble("origin_latitude")),
                        new GeoPoint(rs.getDouble("destination_longitude"), rs.getDouble("destination_latitude")),
                        fromJson(rs.getString("result_json")),
                        rs.getTimestamp("created_at").toInstant()),
                deviceHash, limit);
    }

    private String toJson(RouteComparison comparison) {
        try {
            return objectMapper.writeValueAsString(comparison);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Route comparison result cannot be serialized", exception);
        }
    }

    private RouteComparison fromJson(String json) {
        try {
            return objectMapper.readValue(json, RouteComparison.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored route comparison result cannot be deserialized", exception);
        }
    }
}
