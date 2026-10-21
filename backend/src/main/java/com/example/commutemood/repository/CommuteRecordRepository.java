package com.example.commutemood.repository;

import com.example.commutemood.domain.CommuteRecord;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface CommuteRecordRepository {

    /**
     * 直接保存一条通勤记录，不做幂等判断。仅用于 demo 种子数据与历史写入。
     */
    void save(CommuteRecord record);

    /**
     * 按 {@code (deviceHash, operationId)} 幂等保存（任务 D02）。
     *
     * <p>并发安全：同一幂等键至多写入一条。若已存在相同键的记录，则不写入，
     * 返回 {@code created=false} 且 {@code record} 为已存在的那条，交由服务层比较业务内容
     * 判定"重复成功"或"操作 ID 冲突"。当 {@code record.operationId()} 为 {@code null}
     * （历史/种子路径）时不做幂等，直接写入并返回 {@code created=true}。
     */
    CommuteSaveResult saveIfAbsent(CommuteRecord record);

    /**
     * 按幂等键读取已存在的通勤记录，供冲突判定与测试使用。
     */
    Optional<CommuteRecord> findByOperationId(String deviceHash, String operationId);

    List<CommuteRecord> findByDeviceSince(String deviceHash, Instant since);
}
