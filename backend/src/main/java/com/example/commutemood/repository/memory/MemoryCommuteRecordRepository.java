package com.example.commutemood.repository.memory;

import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.repository.CommuteRecordRepository;
import com.example.commutemood.repository.CommuteSaveResult;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Repository
@Profile("!postgres")
public class MemoryCommuteRecordRepository implements CommuteRecordRepository {
    private final CopyOnWriteArrayList<CommuteRecord> records = new CopyOnWriteArrayList<>();
    /** 幂等索引：key = deviceHash + '\u0000' + operationId，保证同键至多写入一条。 */
    private final ConcurrentMap<String, CommuteRecord> byOperation = new ConcurrentHashMap<>();

    @Override
    public void save(CommuteRecord record) {
        records.add(record);
        if (record.operationId() != null) {
            byOperation.putIfAbsent(operationKey(record.deviceHash(), record.operationId()), record);
        }
    }

    @Override
    public CommuteSaveResult saveIfAbsent(CommuteRecord record) {
        if (record.operationId() == null) {
            // 历史/种子路径无幂等键：直接写入。
            records.add(record);
            return new CommuteSaveResult(true, record);
        }
        String key = operationKey(record.deviceHash(), record.operationId());
        CommuteRecord existing = byOperation.putIfAbsent(key, record);
        if (existing != null) {
            return new CommuteSaveResult(false, existing);
        }
        records.add(record);
        return new CommuteSaveResult(true, record);
    }

    @Override
    public Optional<CommuteRecord> findByOperationId(String deviceHash, String operationId) {
        if (operationId == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(byOperation.get(operationKey(deviceHash, operationId)));
    }

    @Override
    public List<CommuteRecord> findByDeviceSince(String deviceHash, Instant since) {
        return records.stream()
                .filter(record -> record.deviceHash().equals(deviceHash))
                .filter(record -> !record.completedAt().isBefore(since))
                .sorted((left, right) -> left.completedAt().compareTo(right.completedAt()))
                .toList();
    }

    private static String operationKey(String deviceHash, String operationId) {
        return deviceHash + '\u0000' + operationId;
    }
}
