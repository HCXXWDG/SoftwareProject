package com.example.commutemood.repository;

import com.example.commutemood.domain.CommuteRecord;

/**
 * 幂等保存结果（成员 D，任务 D02）。
 *
 * <p>{@code created=true} 表示这是一条新写入的记录；{@code created=false} 表示库中已存在
 * 相同 {@code (deviceHash, operationId)} 的记录，此时 {@code record} 为"已存在的那条"，
 * 由调用方（CommuteService）比较业务内容后判定是"重复成功"还是"操作 ID 冲突"。
 *
 * <p>把"是否新写入"与"重复/冲突的业务判定"分离：仓储只负责并发安全地保证同一幂等键
 * 至多写入一条，业务语义留在服务层，内存与 JDBC 两实现共用同一套判定。
 */
public record CommuteSaveResult(boolean created, CommuteRecord record) {
}
