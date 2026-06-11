package com.example.commutemood.api;

import com.example.commutemood.application.RateLimitExceededException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void mapsIllegalArgumentToBadRequest() {
        ResponseEntity<Map<String, Object>> response = handler.badRequest(
                new IllegalArgumentException("stressLevel must be between 0 and 100"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).containsEntry("code", "invalid_request");
        assertThat(response.getBody()).containsEntry("status", 400);
        assertThat(response.getBody().get("message")).isEqualTo("stressLevel must be between 0 and 100");
        assertThat(response.getBody().get("timestamp")).isNotNull();
    }

    @Test
    void mapsMissingParameterToBadRequest() {
        ResponseEntity<Map<String, Object>> response = handler.badRequest(
                new MissingServletRequestParameterException("bbox", "String"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).containsEntry("code", "invalid_request");
    }

    @Test
    void mapsMalformedJsonToBadRequest() {
        ResponseEntity<Map<String, Object>> response = handler.badRequest(
                new HttpMessageNotReadableException("Malformed JSON", null, null));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).containsEntry("code", "invalid_request");
    }

    @Test
    void mapsRateLimitToTooManyRequests() {
        ResponseEntity<Map<String, Object>> response = handler.rateLimited(new RateLimitExceededException());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(response.getBody()).containsEntry("code", "rate_limited");
        assertThat(response.getBody()).containsEntry("status", 429);
        assertThat(response.getBody().get("message")).isEqualTo("Too many reports. Try again in one minute.");
    }

    @Test
    void masksUnexpectedErrors() {
        ResponseEntity<Map<String, Object>> response = handler.unexpected(new RuntimeException("database down"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).containsEntry("code", "internal_error");
        assertThat(response.getBody().get("message")).isEqualTo("服务暂时不可用，请稍后重试。");
    }
}
