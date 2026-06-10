package com.example.commutemood.application;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.repository.EmotionReportRepository;
import com.example.commutemood.repository.SaveOutcome;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

@Service
public class ReportService {
    private static final Set<Integer> VALID_STRESS_LEVELS = Set.of(0, 25, 50, 75, 100);

    private final EmotionReportRepository repository;
    private final DeviceIdentityService identityService;
    private final ReportRateLimiter rateLimiter;

    public ReportService(
            EmotionReportRepository repository,
            DeviceIdentityService identityService,
            ReportRateLimiter rateLimiter
    ) {
        this.repository = repository;
        this.identityService = identityService;
        this.rateLimiter = rateLimiter;
    }

    public SaveOutcome submit(
            String rawDeviceId,
            double longitude,
            double latitude,
            int stressLevel,
            EmotionTag tag,
            Instant reportedAt
    ) {
        if (!VALID_STRESS_LEVELS.contains(stressLevel)) {
            throw new IllegalArgumentException("stressLevel must be one of 0, 25, 50, 75, 100");
        }
        Instant now = Instant.now();
        Instant timestamp = reportedAt == null ? now : reportedAt;
        if (timestamp.isAfter(now.plusSeconds(300)) || timestamp.isBefore(now.minusSeconds(86400))) {
            throw new IllegalArgumentException("reportedAt must be within the last 24 hours");
        }
        String deviceHash = identityService.hash(rawDeviceId);
        if (!rateLimiter.allow(deviceHash, now)) {
            throw new RateLimitExceededException();
        }
        return repository.save(new EmotionReport(
                UUID.randomUUID(),
                deviceHash,
                new GeoPoint(longitude, latitude),
                stressLevel,
                tag,
                timestamp,
                false));
    }
}

