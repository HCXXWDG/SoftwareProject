package com.example.commutemood.application;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.repository.CommuteRecordRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

@Service
public class CommuteService {
    private static final Set<Integer> VALID_STRESS_LEVELS = Set.of(0, 25, 50, 75, 100);

    private final CommuteRecordRepository repository;
    private final DeviceIdentityService identityService;

    public CommuteService(
            CommuteRecordRepository repository,
            DeviceIdentityService identityService
    ) {
        this.repository = repository;
        this.identityService = identityService;
    }

    public CommuteRecord complete(
            String rawDeviceId,
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
        if (!VALID_STRESS_LEVELS.contains(endStressLevel)) {
            throw new IllegalArgumentException("endStressLevel must be one of 0, 25, 50, 75, 100");
        }
        if (durationMinutes < 1 || durationMinutes > 600) {
            throw new IllegalArgumentException("durationMinutes must be between 1 and 600");
        }
        CommuteRecord record = new CommuteRecord(
                UUID.randomUUID(),
                identityService.hash(rawDeviceId),
                routeId,
                routeLabel,
                endStressLevel,
                durationMinutes,
                selectedScore,
                fastestScore,
                alternativeLabel,
                alternativeScore,
                alternativeDurationRatio,
                confidence,
                completedAt == null ? Instant.now() : completedAt);
        repository.save(record);
        return record;
    }
}

