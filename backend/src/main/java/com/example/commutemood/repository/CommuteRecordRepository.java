package com.example.commutemood.repository;

import com.example.commutemood.domain.CommuteRecord;

import java.time.Instant;
import java.util.List;

public interface CommuteRecordRepository {
    void save(CommuteRecord record);

    List<CommuteRecord> findByDeviceSince(String deviceHash, Instant since);
}

