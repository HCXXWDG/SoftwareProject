package com.example.commutemood.api;

import com.example.commutemood.application.HeatmapService;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.domain.HeatmapCell;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/heatmap")
public class HeatmapController {
    private final HeatmapService heatmapService;

    public HeatmapController(HeatmapService heatmapService) {
        this.heatmapService = heatmapService;
    }

    @GetMapping
    public List<HeatmapCell> get(
            @RequestParam String bbox,
            @RequestParam(defaultValue = "16") int zoom,
            @RequestParam(defaultValue = "168") int hours
    ) {
        String[] parts = bbox.split(",");
        if (parts.length != 4) {
            throw new IllegalArgumentException("bbox must be west,south,east,north");
        }
        GeoBounds bounds = new GeoBounds(
                Double.parseDouble(parts[0]),
                Double.parseDouble(parts[1]),
                Double.parseDouble(parts[2]),
                Double.parseDouble(parts[3]));
        return heatmapService.getHeatmap(bounds, zoom, hours);
    }
}

