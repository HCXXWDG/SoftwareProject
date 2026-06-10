package com.example.commutemood.api;

import com.example.commutemood.api.dto.CommuteCompleteRequest;
import com.example.commutemood.application.CommuteService;
import com.example.commutemood.application.TrendService;
import com.example.commutemood.domain.CommuteRecord;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.ZoneId;

@RestController
@RequestMapping("/api/v1/commutes")
public class CommuteController {
    private final CommuteService commuteService;
    private final TrendService trendService;

    public CommuteController(CommuteService commuteService, TrendService trendService) {
        this.commuteService = commuteService;
        this.trendService = trendService;
    }

    @PostMapping("/complete")
    public CommuteRecord complete(
            @RequestHeader("X-Device-Id") String deviceId,
            @Valid @RequestBody CommuteCompleteRequest request
    ) {
        return commuteService.complete(
                deviceId,
                request.routeId(),
                request.routeLabel(),
                request.endStressLevel(),
                request.durationMinutes(),
                request.selectedScore(),
                request.fastestScore(),
                request.alternativeLabel(),
                request.alternativeScore(),
                request.alternativeDurationRatio(),
                request.confidence(),
                request.completedAt());
    }

    @GetMapping("/trends")
    public TrendService.TrendResult trends(
            @RequestHeader("X-Device-Id") String deviceId,
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(defaultValue = "Asia/Shanghai") String timezone
    ) {
        return trendService.getTrends(deviceId, days, ZoneId.of(timezone));
    }
}

