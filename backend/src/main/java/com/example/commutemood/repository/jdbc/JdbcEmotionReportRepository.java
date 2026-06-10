package com.example.commutemood.repository.jdbc;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.SaveOutcome;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

@Repository
@Profile("postgres")
public class JdbcEmotionReportRepository implements EmotionReportRepository {
    private final JdbcTemplate jdbcTemplate;

    public JdbcEmotionReportRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public SaveOutcome save(EmotionReport report) {
        Integer duplicateCount = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM emotion_report
                WHERE device_hash = ?
                  AND reported_at BETWEEN ?::timestamptz - interval '5 minutes'
                                      AND ?::timestamptz + interval '5 minutes'
                  AND ST_DWithin(location::geography,
                      ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, 25)
                """, Integer.class,
                report.deviceHash(),
                Timestamp.from(report.reportedAt()),
                Timestamp.from(report.reportedAt()),
                report.location().longitude(),
                report.location().latitude());
        if (duplicateCount != null && duplicateCount > 0) {
            return SaveOutcome.DUPLICATE;
        }

        jdbcTemplate.update("""
                        INSERT INTO device_profile(device_hash)
                        VALUES (?)
                        ON CONFLICT (device_hash)
                        DO UPDATE SET last_seen_at = now()
                        """, report.deviceHash());
        jdbcTemplate.update("""
                        INSERT INTO emotion_report
                            (id, device_hash, stress_level, tag, location, reported_at, simulated)
                        VALUES (?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?)
                        """,
                report.id(), report.deviceHash(), report.stressLevel(), report.tag().name(),
                report.location().longitude(), report.location().latitude(),
                Timestamp.from(report.reportedAt()), report.simulated());
        return SaveOutcome.CREATED;
    }

    @Override
    public List<EmotionReport> findWithin(GeoBounds bounds, Instant since) {
        return jdbcTemplate.query("""
                        SELECT id, device_hash, stress_level, tag,
                               ST_X(location) AS longitude, ST_Y(location) AS latitude,
                               reported_at, simulated
                        FROM emotion_report
                        WHERE reported_at >= ?
                          AND location && ST_MakeEnvelope(?, ?, ?, ?, 4326)
                        """,
                (rs, rowNum) -> new EmotionReport(
                        rs.getObject("id", java.util.UUID.class),
                        rs.getString("device_hash"),
                        new GeoPoint(rs.getDouble("longitude"), rs.getDouble("latitude")),
                        rs.getInt("stress_level"),
                        EmotionTag.valueOf(rs.getString("tag")),
                        rs.getTimestamp("reported_at").toInstant(),
                        rs.getBoolean("simulated")),
                Timestamp.from(since), bounds.west(), bounds.south(), bounds.east(), bounds.north());
    }
}

