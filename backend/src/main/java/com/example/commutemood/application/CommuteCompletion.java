package com.example.commutemood.application;

import com.example.commutemood.domain.CommuteRecord;

/**
 * 完成通勤的结果（成员 D，任务 D02）。
 *
 * <ul>
 *   <li>{@link Outcome#CREATED}：首次写入，映射 HTTP 201。</li>
 *   <li>{@link Outcome#DUPLICATE}：同一 (设备, 操作 ID) 且业务内容一致的重复提交，
 *       幂等返回已存在记录，映射 HTTP 200，趋势不重复计数。</li>
 *   <li>{@link Outcome#CONFLICT}：同一 (设备, 操作 ID) 但业务内容不同，映射 HTTP 409，
 *       不写入，返回已存在记录供前端核对。</li>
 * </ul>
 */
public record CommuteCompletion(Outcome outcome, CommuteRecord record) {
    public enum Outcome {
        CREATED,
        DUPLICATE,
        CONFLICT
    }
}
