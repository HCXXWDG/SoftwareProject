package com.example.commutemood.domain;

import java.time.Instant;
import java.util.UUID;

public record CommuteRecord(
        UUID id,
        String deviceHash,
        String routeId,
        String routeLabel,
        int endStressLevel,
        int durationMinutes,
        double selectedScore,
        double fastestScore,
        String alternativeLabel,
        Double alternativeScore,
        Double alternativeDurationRatio,
        double confidence,
        Instant completedAt
) {
}

