package com.example.commutemood.repository.jdbc;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.repository.CommuteRecordRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

@Repository
@Profile("postgres")
public class JdbcCommuteRecordRepository implements CommuteRecordRepository {
    private final JdbcTemplate jdbcTemplate;

    public JdbcCommuteRecordRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void save(CommuteRecord record) {
        jdbcTemplate.update("""
                        INSERT INTO commute_record
                            (id, device_hash, route_id, route_label, end_stress_level,
                             duration_minutes, selected_score, fastest_score, alternative_label,
                             alternative_score, alternative_duration_ratio, confidence, completed_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                record.id(), record.deviceHash(), record.routeId(), record.routeLabel(),
                record.endStressLevel(), record.durationMinutes(), record.selectedScore(),
                record.fastestScore(), record.alternativeLabel(), record.alternativeScore(),
                record.alternativeDurationRatio(), record.confidence(),
                Timestamp.from(record.completedAt()));
    }

    @Override
    public List<CommuteRecord> findByDeviceSince(String deviceHash, Instant since) {
        return jdbcTemplate.query("""
                        SELECT *
                        FROM commute_record
                        WHERE device_hash = ? AND completed_at >= ?
                        ORDER BY completed_at
                        """,
                (rs, rowNum) -> new CommuteRecord(
                        rs.getObject("id", java.util.UUID.class),
                        rs.getString("device_hash"),
                        rs.getString("route_id"),
                        rs.getString("route_label"),
                        rs.getInt("end_stress_level"),
                        rs.getInt("duration_minutes"),
                        rs.getDouble("selected_score"),
                        rs.getDouble("fastest_score"),
                        rs.getString("alternative_label"),
                        rs.getObject("alternative_score", Double.class),
                        rs.getObject("alternative_duration_ratio", Double.class),
                        rs.getDouble("confidence"),
                        rs.getTimestamp("completed_at").toInstant()),
                deviceHash, Timestamp.from(since));
    }
}

