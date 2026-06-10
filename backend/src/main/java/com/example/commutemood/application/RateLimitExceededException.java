package com.example.commutemood.application;

public class RateLimitExceededException extends RuntimeException {
    public RateLimitExceededException() {
        super("Too many reports. Try again in one minute.");
    }
}

