package com.example.commutemood.domain;

import java.time.Instant;
import java.util.UUID;

public record EmotionReport(
        UUID id,
        String deviceHash,
        GeoPoint location,
        int stressLevel,
        EmotionTag tag,
        Instant reportedAt,
        boolean simulated
) {
}

