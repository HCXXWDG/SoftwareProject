package com.example.commutemood.application;

/**
 * 完成通勤时引用的路线比较快照不存在，或不属于该设备（含 demo 服务重启后快照失效）。
 * 调用方应引导前端重新规划路线（映射为 HTTP 404）。
 */
public class SnapshotMissingException extends RuntimeException {
    public SnapshotMissingException(String message) {
        super(message);
    }
}
