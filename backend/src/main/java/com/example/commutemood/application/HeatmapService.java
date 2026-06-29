package com.example.commutemood.application;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.HeatmapCell;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.HeatmapCellRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class HeatmapService {
    private static final double DECAY_HOURS = 72.0;
    private static final double PRIOR_WEIGHT = 3.0;
    private static final double PRIOR_SCORE = 50.0;

    private final EmotionReportRepository repository;
    private final HeatmapCellRepository cellRepository;

    public HeatmapService(EmotionReportRepository repository, HeatmapCellRepository cellRepository) {
        this.repository = repository;
        this.cellRepository = cellRepository;
    }

    public List<HeatmapCell> getHeatmap(GeoBounds bounds, int zoom, int hours) {
        if (zoom < 10 || zoom > 20) {
            throw new IllegalArgumentException("zoom must be between 10 and 20");
        }
        if (hours < 1 || hours > 720) {
            throw new IllegalArgumentException("hours must be between 1 and 720");
        }

        Instant now = Instant.now();
        List<EmotionReport> reports = repository.findWithin(bounds, now.minus(Duration.ofHours(hours)));
        double gridSize = gridSizeForZoom(zoom);
        Map<GridKey, CellAccumulator> cells = new HashMap<>();

        for (EmotionReport report : reports) {
            GridKey key = GridKey.from(report.location(), gridSize);
            double ageHours = Math.max(0,
                    Duration.between(report.reportedAt(), now).toMinutes() / 60.0);
            double weight = Math.exp(-ageHours / DECAY_HOURS);
            cells.computeIfAbsent(key, ignored -> new CellAccumulator())
                    .add(report, weight);
        }

        List<HeatmapCell> result = new ArrayList<>();
        for (Map.Entry<GridKey, CellAccumulator> entry : cells.entrySet()) {
            GridKey key = entry.getKey();
            CellAccumulator accumulator = entry.getValue();
            double score = (accumulator.weightedStress + PRIOR_WEIGHT * PRIOR_SCORE)
                    / (accumulator.totalWeight + PRIOR_WEIGHT);
            double confidence = 1.0 - Math.exp(-accumulator.totalWeight / 5.0);
            EmotionTag dominantTag = accumulator.tagWeights.entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse(EmotionTag.OTHER);
            result.add(new HeatmapCell(
                    zoom + ":" + key.x + ":" + key.y,
                    new GeoPoint((key.x + 0.5) * gridSize, (key.y + 0.5) * gridSize),
                    round(score),
                    round(confidence),
                    accumulator.count,
                    dominantTag));
        }
        return result.stream()
                .sorted(Comparator.comparing(HeatmapCell::cellId))
                .toList();
    }

    public List<HeatmapCell> refreshCachedHeatmap(GeoBounds bounds, int zoom, int hours) {
        List<HeatmapCell> cells = getHeatmap(bounds, zoom, hours);
        cellRepository.upsertAll(zoom, cells);
        return cells;
    }

    static double gridSizeForZoom(int zoom) {
        if (zoom >= 17) {
            return 0.00045;
        }
        if (zoom >= 15) {
            return 0.0009;
        }
        return 0.0018;
    }

    private static double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private record GridKey(long x, long y) {
        static GridKey from(GeoPoint point, double gridSize) {
            return new GridKey(
                    (long) Math.floor(point.longitude() / gridSize),
                    (long) Math.floor(point.latitude() / gridSize));
        }
    }

    private static final class CellAccumulator {
        private double weightedStress;
        private double totalWeight;
        private int count;
        private final Map<EmotionTag, Double> tagWeights = new EnumMap<>(EmotionTag.class);

        void add(EmotionReport report, double weight) {
            weightedStress += report.stressLevel() * weight;
            totalWeight += weight;
            count++;
            tagWeights.merge(report.tag(), weight, Double::sum);
        }
    }
}

