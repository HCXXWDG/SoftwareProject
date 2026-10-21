package com.example.commutemood.application;

/**
 * 报告限频（每设备每分钟 10 次）触发时抛出，由 {@code ApiExceptionHandler} 映射为
 * {@code 429 rate_limited}。文案直接面向用户展示，保持与其余响应一致的中文口径。
 */
public class RateLimitExceededException extends RuntimeException {
    public RateLimitExceededException() {
        super("提交过于频繁，请一分钟后再试。");
    }
}
