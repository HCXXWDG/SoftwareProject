package com.example.commutemood.api;

import com.example.commutemood.api.dto.CommuteCompleteRequest;
import com.example.commutemood.api.dto.CommuteHistoryItem;
import com.example.commutemood.application.CommuteCompletion;
import com.example.commutemood.application.CommuteHistoryService;
import com.example.commutemood.application.CommuteService;
import com.example.commutemood.application.TrendService;
import com.example.commutemood.domain.CommuteRecord;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/commutes")
@Tag(name = "Commutes", description = "Complete commutes and read commute trend summaries.")
public class CommuteController {
    private final CommuteService commuteService;
    private final TrendService trendService;
    private final CommuteHistoryService commuteHistoryService;

    public CommuteController(
            CommuteService commuteService,
            TrendService trendService,
            CommuteHistoryService commuteHistoryService
    ) {
        this.commuteService = commuteService;
        this.trendService = trendService;
        this.commuteHistoryService = commuteHistoryService;
    }

    @PostMapping("/complete")
    @Operation(summary = "Complete a commute using a server-side route snapshot")
    public ResponseEntity<Map<String, Object>> complete(
            @RequestHeader("X-Device-Id") String deviceId,
            @Valid @RequestBody CommuteCompleteRequest request
    ) {
        CommuteCompletion completion = commuteService.complete(
                deviceId,
                request.snapshotId(),
                request.operationId(),
                request.routeId(),
                request.endStressLevel(),
                request.completedAt());

        return switch (completion.outcome()) {
            case CREATED -> ResponseEntity.status(HttpStatus.CREATED)
                    .body(successBody("created", completion.record(), "通勤已记录。"));
            case DUPLICATE -> ResponseEntity.ok(
                    successBody("duplicate", completion.record(), "该通勤已记录，返回既有结果，趋势不重复计数。"));
            case CONFLICT -> ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(conflictBody(completion.record(), request.operationId()));
        };
    }

    @GetMapping("/trends")
    @Operation(summary = "Get commute trends")
    public TrendService.TrendResult trends(
            @RequestHeader("X-Device-Id") String deviceId,
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(defaultValue = "Asia/Shanghai") String timezone
    ) {
        return trendService.getTrends(deviceId, days, ZoneId.of(timezone));
    }

    /**
     * 通勤历史明细（任务 D05）。与 {@code /trends} 同一时区、同一自然日窗口、同一去重口径，
     * 因此"趋势里的次数"和"历史里的条数"不会对不上。旧记录通过 {@code legacyRecord} 与
     * {@code missingFields} 显式标记，前端无需猜测缺失字段。
     */
    @GetMapping("/history")
    @Operation(summary = "Get commute history with explicit legacy markers")
    public List<CommuteHistoryItem> history(
            @RequestHeader("X-Device-Id") String deviceId,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "30") int days,
            @RequestParam(defaultValue = "Asia/Shanghai") String timezone
    ) {
        return commuteHistoryService.getHistory(deviceId, limit, days, ZoneId.of(timezone));
    }

    private Map<String, Object> successBody(String status, CommuteRecord record, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", status);
        body.put("commuteId", record.id());
        body.put("operationId", record.operationId());
        body.put("snapshotId", record.snapshotId());
        body.put("routeId", record.routeId());
        body.put("routeLabel", record.routeLabel());
        body.put("routeSource", record.routeSource() == null ? null : record.routeSource().name());
        body.put("estimatedSeconds", record.estimatedSeconds());
        body.put("durationMinutes", record.durationMinutes());
        body.put("selectedScore", record.selectedScore());
        body.put("endStressLevel", record.endStressLevel());
        body.put("completedAt", record.completedAt().toString());
        body.put("message", message);
        return body;
    }

    private Map<String, Object> conflictBody(CommuteRecord existing, String operationId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "conflict");
        body.put("operationId", operationId);
        if (existing != null) {
            body.put("existingCommuteId", existing.id());
            body.put("existingSnapshotId", existing.snapshotId());
            body.put("existingRouteId", existing.routeId());
        }
        body.put("message", "相同操作 ID 已用于不同内容的通勤提交，请核对后使用新的操作 ID 重试。");
        return body;
    }
}
