package com.example.commutemood.repository.memory;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.repository.CommuteRecordRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Repository
@Profile("!postgres")
public class MemoryCommuteRecordRepository implements CommuteRecordRepository {
    private final CopyOnWriteArrayList<CommuteRecord> records = new CopyOnWriteArrayList<>();

    @Override
    public void save(CommuteRecord record) {
        records.add(record);
    }

    @Override
    public List<CommuteRecord> findByDeviceSince(String deviceHash, Instant since) {
        return records.stream()
                .filter(record -> record.deviceHash().equals(deviceHash))
                .filter(record -> !record.completedAt().isBefore(since))
                .sorted((left, right) -> left.completedAt().compareTo(right.completedAt()))
                .toList();
    }
}

