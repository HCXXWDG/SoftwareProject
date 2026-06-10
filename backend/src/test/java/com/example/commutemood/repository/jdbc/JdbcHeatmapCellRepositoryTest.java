package com.example.commutemood.repository.jdbc;

import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.HeatmapCell;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class JdbcHeatmapCellRepositoryTest {
    @Test
    void upsertAllWritesHeatmapCellIntoPostgisCache() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcHeatmapCellRepository repository = new JdbcHeatmapCellRepository(jdbcTemplate);
        HeatmapCell cell = new HeatmapCell(
                "16:129333:44344",
                new GeoPoint(116.3997, 39.9096),
                62.5,
                0.72,
                12,
                EmotionTag.CROWD);

        repository.upsertAll(16, List.of(cell));

        verify(jdbcTemplate).update(
                contains("INSERT INTO emotion_cell"),
                eq(cell.cellId()),
                eq(16),
                eq(cell.center().longitude()),
                eq(cell.center().latitude()),
                eq(cell.score()),
                eq(cell.confidence()),
                eq(cell.count()),
                eq(cell.dominantTag().name()));
    }
}
