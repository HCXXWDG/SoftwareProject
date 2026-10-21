package com.example.commutemood.api;

import com.example.commutemood.application.HeatmapService;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.domain.HeatmapCell;
import com.example.commutemood.repository.ReportScope;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/heatmap")
@Tag(name = "Heatmap", description = "Read and refresh commute mood heatmap cells.")
public class HeatmapController {
    private final HeatmapService heatmapService;
    private final ReportScope defaultScope;

    public HeatmapController(HeatmapService heatmapService,
            @Value("${app.heatmap.default-scope:REAL_ONLY}") ReportScope defaultScope) {
        this.heatmapService = heatmapService;
        this.defaultScope = defaultScope;
    }

    @GetMapping
    @Operation(summary = "Get heatmap cells", description = "Omitted scope uses the configured default: ALL in demo, REAL_ONLY otherwise. Explicit scope overrides the default.")
    public List<HeatmapCell> get(
            @RequestParam String bbox,
            @RequestParam(defaultValue = "16") int zoom,
            @RequestParam(defaultValue = "168") int hours,
            @RequestParam(required = false) ReportScope scope
    ) {
        return heatmapService.getHeatmap(parseBounds(bbox), zoom, hours,
                scope == null ? defaultScope : scope);
    }

    @PostMapping("/refresh")
    @Operation(summary = "Refresh persisted heatmap cells")
    public List<HeatmapCell> refresh(
            @RequestParam String bbox,
            @RequestParam(defaultValue = "16") int zoom,
            @RequestParam(defaultValue = "168") int hours
    ) {
        return heatmapService.refreshCachedHeatmap(parseBounds(bbox), zoom, hours);
    }

    private GeoBounds parseBounds(String bbox) {
        String[] parts = bbox.split(",");
        if (parts.length != 4) {
            throw new IllegalArgumentException("bbox must be west,south,east,north");
        }
        return new GeoBounds(
                Double.parseDouble(parts[0]),
                Double.parseDouble(parts[1]),
                Double.parseDouble(parts[2]),
                Double.parseDouble(parts[3]));
    }
}

