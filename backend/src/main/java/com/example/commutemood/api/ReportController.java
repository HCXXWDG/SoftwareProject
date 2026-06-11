package com.example.commutemood.api;

import com.example.commutemood.api.dto.ReportRequest;
import com.example.commutemood.application.ReportService;
import com.example.commutemood.repository.SaveOutcome;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/reports")
@Tag(name = "Reports", description = "Submit commute mood reports for heatmap aggregation.")
public class ReportController {
    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @PostMapping
    @Operation(summary = "Submit a mood report")
    public ResponseEntity<Map<String, Object>> submit(
            @Parameter(name = "X-Device-Id", description = "Anonymous browser device identifier", required = true, in = ParameterIn.HEADER)
            @RequestHeader("X-Device-Id") String deviceId,
            @Valid @RequestBody ReportRequest request
    ) {
        SaveOutcome outcome = reportService.submit(
                deviceId,
                request.location().longitude(),
                request.location().latitude(),
                request.stressLevel(),
                request.tag(),
                request.reportedAt());
        if (outcome == SaveOutcome.DUPLICATE) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("status", "duplicate", "message", "五分钟内已提交过附近路段。"));
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("status", "created", "message", "情绪反馈已加入热力图。"));
    }
}

