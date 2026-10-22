package com.example.commutemood.repository.jdbc;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.RouteSource;
import com.example.commutemood.repository.CommuteRecordRepository;
import com.example.commutemood.repository.CommuteSaveResult;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
@Profile("postgres")
public class JdbcCommuteRecordRepository implements CommuteRecordRepository {

    /** 与 V4 部分唯一索引 (device_hash, operation_id) WHERE operation_id IS NOT NULL 对应。 */
    private static final String INSERT_COLUMNS = """
            INSERT INTO commute_record
                (id, device_hash, operation_id, snapshot_id, route_id, route_label, route_source,
                 end_stress_level, duration_minutes, estimated_seconds, selected_score, fastest_score,
                 alternative_label, alternative_score, alternative_duration_ratio, confidence, completed_at)
            VALUES (?, ?, CAST(? AS varchar), CAST(? AS uuid), ?, ?, ?,
                    ?, ?, CAST(? AS integer), ?, ?,
                    ?, ?, ?, ?, ?)
            """;

    private static final String SELECT_COLUMNS = """
            SELECT id, device_hash, operation_id, snapshot_id, route_id, route_label, route_source,
                   end_stress_level, duration_minutes, estimated_seconds, selected_score, fastest_score,
                   alternative_label, alternative_score, alternative_duration_ratio, confidence, completed_at
            FROM commute_record
            """;

    private final JdbcTemplate jdbcTemplate;

    public JdbcCommuteRecordRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public void save(CommuteRecord record) {
        upsertDeviceProfile(record.deviceHash());
        jdbcTemplate.update(INSERT_COLUMNS, insertArgs(record));
    }

    @Override
    @Transactional
    public CommuteSaveResult saveIfAbsent(CommuteRecord record) {
        if (record.operationId() == null) {
            save(record);
            return new CommuteSaveResult(true, record);
        }
        upsertDeviceProfile(record.deviceHash());
        int inserted = jdbcTemplate.update(
                INSERT_COLUMNS
                        + " ON CONFLICT (device_hash, operation_id) WHERE operation_id IS NOT NULL DO NOTHING",
                insertArgs(record));
        if (inserted > 0) {
            return new CommuteSaveResult(true, record);
        }
        // 冲突：回读已存在的那条，交服务层判定重复成功或操作 ID 冲突。
        CommuteRecord existing = findByOperationId(record.deviceHash(), record.operationId()).orElse(null);
        return new CommuteSaveResult(false, existing);
    }

    @Override
    public Optional<CommuteRecord> findByOperationId(String deviceHash, String operationId) {
        if (operationId == null) {
            return Optional.empty();
        }
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE device_hash = ? AND operation_id = ?",
                        COMMUTE_ROW_MAPPER, deviceHash, operationId)
                .stream()
                .findFirst();
    }

    @Override
    public List<CommuteRecord> findByDeviceSince(String deviceHash, Instant since) {
        return jdbcTemplate.query(
                SELECT_COLUMNS + " WHERE device_hash = ? AND completed_at >= ? ORDER BY completed_at",
                COMMUTE_ROW_MAPPER,
                deviceHash, Timestamp.from(since));
    }

    private void upsertDeviceProfile(String deviceHash) {
        jdbcTemplate.update("""
                        INSERT INTO device_profile(device_hash)
                        VALUES (?)
                        ON CONFLICT (device_hash)
                        DO UPDATE SET last_seen_at = now()
                        """, deviceHash);
    }

    private Object[] insertArgs(CommuteRecord record) {
        return new Object[]{
                record.id(),
                record.deviceHash(),
                record.operationId(),
                record.snapshotId(),
                record.routeId(),
                record.routeLabel(),
                record.routeSource() == null ? RouteSource.UNKNOWN.name() : record.routeSource().name(),
                record.endStressLevel(),
                record.durationMinutes(),
                record.estimatedSeconds(),
                record.selectedScore(),
                record.fastestScore(),
                record.alternativeLabel(),
                record.alternativeScore(),
                record.alternativeDurationRatio(),
                record.confidence(),
                Timestamp.from(record.completedAt())
        };
    }

    private static final RowMapper<CommuteRecord> COMMUTE_ROW_MAPPER = (ResultSet rs, int rowNum) -> new CommuteRecord(
            rs.getObject("id", UUID.class),
            rs.getString("device_hash"),
            rs.getString("operation_id"),
            nullableUuid(rs, "snapshot_id"),
            rs.getString("route_id"),
            rs.getString("route_label"),
            parseSource(rs.getString("route_source")),
            rs.getInt("end_stress_level"),
            rs.getInt("duration_minutes"),
            nullableInt(rs, "estimated_seconds"),
            // 评分与置信度自 V6 起可空：真实路线但沿途无反馈时快照不带评分，
            // 这里必须按 NULL 读回，不能用 rs.getDouble（它对 NULL 返回 0，会把"没有评分"变成"压力 0 分"）。
            nullableDouble(rs, "selected_score"),
            nullableDouble(rs, "fastest_score"),
            rs.getString("alternative_label"),
            nullableDouble(rs, "alternative_score"),
            nullableDouble(rs, "alternative_duration_ratio"),
            nullableDouble(rs, "confidence"),
            rs.getTimestamp("completed_at").toInstant());

    private static RouteSource parseSource(String value) {
        if (value == null || value.isBlank()) {
            return RouteSource.UNKNOWN;
        }
        try {
            return RouteSource.valueOf(value);
        } catch (IllegalArgumentException ignored) {
            return RouteSource.UNKNOWN;
        }
    }

    private static UUID nullableUuid(ResultSet rs, String column) throws SQLException {
        Object value = rs.getObject(column);
        return value == null ? null : rs.getObject(column, UUID.class);
    }

    private static Integer nullableInt(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static Double nullableDouble(ResultSet rs, String column) throws SQLException {
        double value = rs.getDouble(column);
        return rs.wasNull() ? null : value;
    }
}
