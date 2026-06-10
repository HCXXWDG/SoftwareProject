package com.example.commutemood.application;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ReportRateLimiter {
    private static final int MAX_REPORTS_PER_MINUTE = 10;
    private final Map<String, ArrayDeque<Instant>> requests = new ConcurrentHashMap<>();

    public boolean allow(String deviceHash, Instant now) {
        ArrayDeque<Instant> queue = requests.computeIfAbsent(deviceHash, ignored -> new ArrayDeque<>());
        synchronized (queue) {
            Instant cutoff = now.minusSeconds(60);
            while (!queue.isEmpty() && queue.peekFirst().isBefore(cutoff)) {
                queue.removeFirst();
            }
            if (queue.size() >= MAX_REPORTS_PER_MINUTE) {
                return false;
            }
            queue.addLast(now);
            return true;
        }
    }
}

