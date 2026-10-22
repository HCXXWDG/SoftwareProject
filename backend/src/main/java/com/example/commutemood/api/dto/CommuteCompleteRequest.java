package com.example.commutemood.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

/**
 * 完成通勤请求（D02 快照契约）。
 *
 * <p>前端不再提交任何评分或时长：这些由服务端按 {@code snapshotId} 从快照重建，杜绝篡改。
 * 前端只提供：本次依据的快照标识、幂等操作 ID、选中的路线 ID、以及用户主观感受。
 *
 * <p>{@code operationId} 规则（S00 契约第 3 项）：同一次通勤的网络重试必须复用同一 ID，
 * 新的一次通勤必须换新 ID；服务端据此保证"并发重复只保存一条"。
 *
 * <p>可选的完成评价（如"反馈成功评价"）本轮暂未纳入；若后续加入，应与同一次通勤
 * （同一 {@code operationId}）关联，见任务书 D02 说明。
 */
public record CommuteCompleteRequest(
        @NotNull UUID snapshotId,
        @NotBlank String operationId,
        @NotBlank String routeId,
        @NotNull Integer endStressLevel,
        Instant completedAt
) {
}
