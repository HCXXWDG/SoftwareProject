package com.example.commutemood.repository.jdbc;

import com.example.commutemood.domain.HeatmapCell;
import com.example.commutemood.repository.HeatmapCellRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
@Profile("postgres")
public class JdbcHeatmapCellRepository implements HeatmapCellRepository {
    private final JdbcTemplate jdbcTemplate;

    public JdbcHeatmapCellRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void upsertAll(int zoom, List<HeatmapCell> cells) {
        for (HeatmapCell cell : cells) {
            jdbcTemplate.update("""
                            INSERT INTO emotion_cell(
                                cell_id,
                                zoom_level,
                                center,
                                score,
                                confidence,
                                sample_count,
                                dominant_tag,
                                refreshed_at
                            )
                            VALUES (?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?, ?, ?, now())
                            ON CONFLICT (cell_id)
                            DO UPDATE SET
                                zoom_level = EXCLUDED.zoom_level,
                                center = EXCLUDED.center,
                                score = EXCLUDED.score,
                                confidence = EXCLUDED.confidence,
                                sample_count = EXCLUDED.sample_count,
                                dominant_tag = EXCLUDED.dominant_tag,
                                refreshed_at = now()
                            """,
                    cell.cellId(),
                    zoom,
                    cell.center().longitude(),
                    cell.center().latitude(),
                    cell.score(),
                    cell.confidence(),
                    cell.count(),
                    cell.dominantTag().name());
        }
    }
}
