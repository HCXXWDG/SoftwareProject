package com.example.commutemood.api;

import com.example.commutemood.api.dto.ReportRequest;
import com.example.commutemood.application.ReportService;
import com.example.commutemood.repository.SaveOutcome;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/reports")
@Tag(name = "Reports", description = "Submit commute mood reports for heatmap aggregation.")
public class ReportController {
    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    /**
     * 提交情绪反馈。
     *
     * <p>响应口径（D04）：成功与重复都用 2xx 返回同一套字段，前端只需读
     * {@code code} / {@code counted} 就能区分“新增成功”和“重复但已记录”，
     * 不必从异常里解析错误文本；限频与参数错误仍走 4xx，并带稳定 {@code code}。</p>
     *
     * <p>重复反馈从 {@code 409} 改为 {@code 200}：前端 fetch 封装对所有非 2xx 一律抛异常，
     * 409 会让 C02 已经写好的 {@code result.status === "duplicate"} 分支永远走不到。
     * 语义上重复提交也不是错误——请求被正确理解并已被记录，只是不重复计数。</p>
     */
    @PostMapping
    @Operation(summary = "Submit a mood report")
    public ResponseEntity<Map<String, Object>> submit(
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
            return ResponseEntity.ok(body(
                    "duplicate",
                    "report_duplicate",
                    false,
                    "五分钟内已提交过附近路段，本次不重复计入。"));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(body(
                "created",
                "report_created",
                true,
                "情绪反馈已加入热力图。"));
    }

    private Map<String, Object> body(String status, String code, boolean counted, String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("status", status);
        payload.put("code", code);
        // counted=false 表示这次请求没有新增反馈，前端不应把它计入“我的反馈数”
        payload.put("counted", counted);
        payload.put("message", message);
        return payload;
    }
}
