package com.example.commutemood.application;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.HeatmapCell;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.HeatmapCellRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HeatmapServiceTest {
    @Test
    void appliesPriorSoOneExtremeReportDoesNotCreateAnExtremeCell() {
        EmotionReportRepository repository = mock(EmotionReportRepository.class);
        when(repository.findWithin(any(), any())).thenReturn(List.of(
                new EmotionReport(
                        UUID.randomUUID(),
                        "device",
                        new GeoPoint(116.4, 39.9),
                        100,
                        EmotionTag.NOISE,
                        Instant.now(),
                        false)));

        HeatmapService service = new HeatmapService(repository, mock(HeatmapCellRepository.class));
        List<HeatmapCell> cells = service.getHeatmap(
                new GeoBounds(116.39, 39.89, 116.41, 39.91), 16, 24);

        assertThat(cells).hasSize(1);
        assertThat(cells.get(0).score()).isBetween(62.0, 63.0);
        assertThat(cells.get(0).confidence()).isBetween(0.18, 0.19);
    }

    @Test
    void usesFinerGridAtHigherZoom() {
        assertThat(HeatmapService.gridSizeForZoom(17))
                .isLessThan(HeatmapService.gridSizeForZoom(15));
    }

    @Test
    void refreshPersistsComputedCells() {
        EmotionReportRepository reportRepository = mock(EmotionReportRepository.class);
        HeatmapCellRepository cellRepository = mock(HeatmapCellRepository.class);
        when(reportRepository.findWithin(any(), any())).thenReturn(List.of(
                new EmotionReport(
                        UUID.randomUUID(),
                        "device",
                        new GeoPoint(116.4, 39.9),
                        75,
                        EmotionTag.CROWD,
                        Instant.now(),
                        false)));
        HeatmapService service = new HeatmapService(reportRepository, cellRepository);

        List<HeatmapCell> cells = service.refreshCachedHeatmap(
                new GeoBounds(116.39, 39.89, 116.41, 39.91), 16, 24);

        assertThat(cells).hasSize(1);
        verify(cellRepository).upsertAll(eq(16), eq(cells));
    }
}

