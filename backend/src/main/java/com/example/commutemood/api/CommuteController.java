package com.example.commutemood.api;

import com.example.commutemood.api.dto.CommuteCompleteRequest;
import com.example.commutemood.application.CommuteService;
import com.example.commutemood.application.TrendService;
import com.example.commutemood.domain.CommuteRecord;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Commutes", description = "Complete commutes and read commute trend summaries.")
public class CommuteController {
    private final CommuteService commuteService;
    private final TrendService trendService;

    public CommuteController(CommuteService commuteService, TrendService trendService) {
        this.commuteService = commuteService;
        this.trendService = trendService;
    }

    @PostMapping("/complete")
    @Operation(summary = "Complete a commute")
    public CommuteRecord complete(
            @Parameter(name = "X-Device-Id", description = "Anonymous browser device identifier", required = true, in = ParameterIn.HEADER)
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
    @Operation(summary = "Get commute trends")
    public TrendService.TrendResult trends(
            @Parameter(name = "X-Device-Id", description = "Anonymous browser device identifier", required = true, in = ParameterIn.HEADER)
            @RequestHeader("X-Device-Id") String deviceId,
            @Parameter(description = "Number of days to include", example = "7")
            @RequestParam(defaultValue = "7") int days,
            @Parameter(description = "IANA timezone for grouping daily points", example = "Asia/Shanghai")
            @RequestParam(defaultValue = "Asia/Shanghai") String timezone
    ) {
        return trendService.getTrends(deviceId, days, ZoneId.of(timezone));
    }
}

