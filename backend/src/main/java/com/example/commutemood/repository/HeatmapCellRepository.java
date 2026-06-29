package com.example.commutemood.repository;

import com.example.commutemood.domain.HeatmapCell;

import java.util.List;

public interface HeatmapCellRepository {
    void upsertAll(int zoom, List<HeatmapCell> cells);
}
