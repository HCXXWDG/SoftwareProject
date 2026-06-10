package com.example.commutemood.repository;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.GeoBounds;

import java.time.Instant;
import java.util.List;

public interface EmotionReportRepository {
    SaveOutcome save(EmotionReport report);

    List<EmotionReport> findWithin(GeoBounds bounds, Instant since);
}

