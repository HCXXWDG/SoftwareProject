package com.example.commutemood.api;

import com.example.commutemood.application.DemoResultRejectedException;
import com.example.commutemood.application.RateLimitExceededException;
import com.example.commutemood.application.SnapshotExpiredException;
import com.example.commutemood.application.SnapshotMissingException;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.DateTimeException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 全局错误映射（S00 契约第 1 条"错误结构"）。
 *
 * <p>所有错误响应统一为：{@code timestamp / status / code / message}，参数类错误额外带
 * {@code fields}（字段名 → 人话原因）。前端只需按 {@code code} 分支，把 {@code message}
 * 直接展示给用户即可。
 *
 * <p><b>为什么这里要"重写"消息而不是直接回传 {@code exception.getMessage()}</b>：
 * Spring 的默认消息会把 Java 方法签名、内部类名原样吐给客户端，例如
 * {@code Validation failed for argument [1] in public org.springframework.http.ResponseEntity<...>
 * com.example.commutemood.api.CommuteController.complete(java.lang.String, ...)}。
 * 这既是信息泄露（暴露包结构与实现细节），也让前端无法展示。因此本类：
 * <ol>
 *   <li>对每类异常自己组织中文文案，只保留调用方需要知道的字段与原因；</li>
 *   <li>出口处再用 {@link #sanitize} 兜底——任何仍含包名的消息一律降级为通用文案，
 *       原始消息只写进服务端日志。</li>
 * </ol>
 */
@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    /** 兜底：出现内部包名 / 类名特征就判定为"不可外泄"。 */
    private static final Pattern INTERNAL_LEAK =
            Pattern.compile("com\\.example|org\\.springframework|org\\.hibernate|java\\.(lang|util|time)\\.");

    private static final String GENERIC_BAD_REQUEST = "请求参数不正确，请检查后重试。";

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> validationFailed(MethodArgumentNotValidException exception) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError error : exception.getBindingResult().getFieldErrors()) {
            // 同一字段可能有多条约束失败，保留第一条即可，避免响应体膨胀
            fields.putIfAbsent(error.getField(), sanitize(error.getDefaultMessage()));
        }
        for (ObjectError error : exception.getBindingResult().getGlobalErrors()) {
            fields.putIfAbsent(error.getObjectName(), sanitize(error.getDefaultMessage()));
        }
        log.debug("Request body validation failed: {}", exception.getBindingResult());
        return response(HttpStatus.BAD_REQUEST, "invalid_request",
                "请求体校验失败：" + String.join("、", fields.keySet()), fields);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> unreadableBody(HttpMessageNotReadableException exception) {
        // 反序列化失败也走这里（如枚举值不认识）。Jackson 的原文含类名，必须替换掉。
        log.debug("Unreadable request body", exception);

        // 能定位到具体字段时（枚举取值不认识、字段类型不匹配），点名该字段，
        // 前端就能提示"tag 取值不合法"而不是笼统的"请求体有问题"。
        if (exception.getCause() instanceof MismatchedInputException mismatch) {
            String field = lastFieldName(mismatch);
            if (field != null) {
                return response(HttpStatus.BAD_REQUEST, "invalid_request",
                        "字段取值不合法：" + field,
                        Map.of(field, "取值不在允许范围内，或类型不匹配"));
            }
        }
        return response(HttpStatus.BAD_REQUEST, "invalid_request",
                "请求体不是合法的 JSON，或字段取值不在允许范围内。");
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> missingParameter(MissingServletRequestParameterException exception) {
        return response(HttpStatus.BAD_REQUEST, "invalid_request",
                "缺少必需参数：" + exception.getParameterName(),
                Map.of(exception.getParameterName(), "该参数为必填"));
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<Map<String, Object>> missingHeader(MissingRequestHeaderException exception) {
        return response(HttpStatus.BAD_REQUEST, "invalid_request",
                "缺少必需请求头：" + exception.getHeaderName(),
                Map.of(exception.getHeaderName(), "该请求头为必填"));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> typeMismatch(MethodArgumentTypeMismatchException exception) {
        return response(HttpStatus.BAD_REQUEST, "invalid_request",
                "参数格式不正确：" + exception.getName(),
                Map.of(exception.getName(), "取值类型或格式不符合要求"));
    }

    @ExceptionHandler(DateTimeException.class)
    public ResponseEntity<Map<String, Object>> badDateTime(DateTimeException exception) {
        log.debug("Invalid date-time value in request", exception);
        return response(HttpStatus.BAD_REQUEST, "invalid_request", "时间或时区取值不合法。");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> badArgument(IllegalArgumentException exception) {
        // 业务代码主动抛出的 IllegalArgumentException 通常已是中文可读文案，
        // 仍要过一遍 sanitize：JDK / 第三方抛出的同类异常会带内部类名。
        String message = sanitize(exception.getMessage());
        if (message.equals(GENERIC_BAD_REQUEST)) {
            log.debug("IllegalArgumentException with non-publishable message", exception);
        }
        return response(HttpStatus.BAD_REQUEST, "invalid_request", message);
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<Map<String, Object>> rateLimited(RateLimitExceededException exception) {
        return response(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", exception.getMessage());
    }

    @ExceptionHandler(SnapshotMissingException.class)
    public ResponseEntity<Map<String, Object>> snapshotMissing(SnapshotMissingException exception) {
        return response(HttpStatus.NOT_FOUND, "snapshot_not_found", exception.getMessage());
    }

    @ExceptionHandler(SnapshotExpiredException.class)
    public ResponseEntity<Map<String, Object>> snapshotExpired(SnapshotExpiredException exception) {
        return response(HttpStatus.GONE, "snapshot_expired", exception.getMessage());
    }

    @ExceptionHandler(DemoResultRejectedException.class)
    public ResponseEntity<Map<String, Object>> demoResultRejected(DemoResultRejectedException exception) {
        return response(HttpStatus.UNPROCESSABLE_ENTITY, "demo_result_not_allowed", exception.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpected(Exception exception) {
        // 对外只返回统一文案，但服务端必须留下堆栈，否则 500 无法定位
        log.error("Unhandled exception while processing request", exception);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error",
                "服务暂时不可用，请稍后重试。");
    }

    /**
     * 把可能带内部实现细节的消息降级为通用文案。
     * 校验注解上的 {@code message} 都是我们自己写的中文，正常不会被降级。
     */
    private String sanitize(String message) {
        if (message == null || message.isBlank() || INTERNAL_LEAK.matcher(message).find()) {
            return GENERIC_BAD_REQUEST;
        }
        return message;
    }

    /**
     * 从 Jackson 的引用路径里取最靠近叶子的字段名。
     * 数组下标（{@code getFieldName() == null}）会被跳过，只保留真正的属性名。
     */
    private String lastFieldName(MismatchedInputException exception) {
        String field = null;
        for (JsonMappingException.Reference reference : exception.getPath()) {
            if (reference.getFieldName() != null) {
                field = reference.getFieldName();
            }
        }
        return field;
    }

    private ResponseEntity<Map<String, Object>> response(
            HttpStatus status,
            String code,
            String message
    ) {
        return response(status, code, message, null);
    }

    private ResponseEntity<Map<String, Object>> response(
            HttpStatus status,
            String code,
            String message,
            Map<String, String> fields
    ) {
        // 注意：Map.of 不接受 null 值；字段错误可能为 null（极少见），逐个过滤
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        body.put("code", code);
        body.put("message", sanitizeOrDefault(message, status));
        if (fields != null && !fields.isEmpty()) {
            Map<String, String> safe = new LinkedHashMap<>();
            fields.forEach((key, value) -> safe.put(key, value == null ? GENERIC_BAD_REQUEST : value));
            body.put("fields", safe);
        }
        return ResponseEntity.status(status).body(Map.copyOf(body));
    }

    private String sanitizeOrDefault(String message, HttpStatus status) {
        if (message == null || message.isBlank()) {
            return status.getReasonPhrase();
        }
        return INTERNAL_LEAK.matcher(message).find() ? GENERIC_BAD_REQUEST : message;
    }
}
