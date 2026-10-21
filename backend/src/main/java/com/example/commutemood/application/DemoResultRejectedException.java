package com.example.commutemood.application;

/**
 * 快照来源为演示/模拟，不允许写入真实通勤统计（映射为 HTTP 422）。
 * 对应 D02 验收"真实记录不会携带演示评分"。
 */
public class DemoResultRejectedException extends RuntimeException {
    public DemoResultRejectedException(String message) {
        super(message);
    }
}
