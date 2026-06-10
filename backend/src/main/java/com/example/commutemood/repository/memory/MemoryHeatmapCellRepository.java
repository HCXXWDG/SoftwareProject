package com.example.commutemood.repository.memory;

import com.example.commutemood.domain.HeatmapCell;
import com.example.commutemood.repository.HeatmapCellRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
@Profile("!postgres")
public class MemoryHeatmapCellRepository implements HeatmapCellRepository {
    @Override
    public void upsertAll(int zoom, List<HeatmapCell> cells) {
        // Demo mode computes heatmap cells on demand and does not persist a cache.
    }
}
