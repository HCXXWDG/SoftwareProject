package com.example.commutemood.api;

import com.example.commutemood.application.DemoResultRejectedException;
import com.example.commutemood.application.RateLimitExceededException;
import com.example.commutemood.application.SnapshotExpiredException;
import com.example.commutemood.application.SnapshotMissingException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.DateTimeException;
import java.time.Instant;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler({
            IllegalArgumentException.class,
            DateTimeException.class,
            HttpMessageNotReadableException.class,
            MethodArgumentNotValidException.class,
            MissingRequestHeaderException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class
    })
    public ResponseEntity<Map<String, Object>> badRequest(Exception exception) {
        return response(HttpStatus.BAD_REQUEST, "invalid_request", exception.getMessage());
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

    private ResponseEntity<Map<String, Object>> response(
            HttpStatus status,
            String code,
            String message
    ) {
        return ResponseEntity.status(status).body(Map.of(
                "timestamp", Instant.now().toString(),
                "status", status.value(),
                "code", code,
                "message", message == null ? status.getReasonPhrase() : message));
    }
}

