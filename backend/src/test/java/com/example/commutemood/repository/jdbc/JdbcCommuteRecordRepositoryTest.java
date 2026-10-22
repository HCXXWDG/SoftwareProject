package com.example.commutemood.repository.jdbc;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.RouteSource;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;

class JdbcCommuteRecordRepositoryTest {

    @Test
    void saveUpsertsDeviceProfileThenInsertsAllCommuteColumns() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcCommuteRecordRepository repository = new JdbcCommuteRecordRepository(jdbcTemplate);
        UUID snapshotId = UUID.randomUUID();
        CommuteRecord record = new CommuteRecord(
                UUID.randomUUID(),
                "device-hash",
                "op-1",
                snapshotId,
                "route-fast",
                "Fast",
                RouteSource.REAL,
                50,
                18,
                1080,
                62.0,
                62.0,
                "Calm",
                43.0,
                1.12,
                0.72,
                Instant.now());

        repository.save(record);

        var inOrder = inOrder(jdbcTemplate);
        inOrder.verify(jdbcTemplate).update(
                contains("INSERT INTO device_profile"),
                eq("device-hash"));
        inOrder.verify(jdbcTemplate).update(
                contains("INSERT INTO commute_record"),
                eq(record.id()),
                eq(record.deviceHash()),
                eq(record.operationId()),
                eq(record.snapshotId()),
                eq(record.routeId()),
                eq(record.routeLabel()),
                eq(RouteSource.REAL.name()),
                eq(record.endStressLevel()),
                eq(record.durationMinutes()),
                eq(record.estimatedSeconds()),
                eq(record.selectedScore()),
                eq(record.fastestScore()),
                eq(record.alternativeLabel()),
                eq(record.alternativeScore()),
                eq(record.alternativeDurationRatio()),
                eq(record.confidence()),
                eq(java.sql.Timestamp.from(record.completedAt())));
    }
}
