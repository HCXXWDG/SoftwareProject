package com.example.commutemood.application;

/**
 * 完成通勤时引用的快照已超过有效期（映射为 HTTP 410 Gone）。
 * 与"缺失"区分开，前端据此提示"结果已过期，请重新规划路线"。
 */
public class SnapshotExpiredException extends RuntimeException {
    public SnapshotExpiredException(String message) {
        super(message);
    }
}
