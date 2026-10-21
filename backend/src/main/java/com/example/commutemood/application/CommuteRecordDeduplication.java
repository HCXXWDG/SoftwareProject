package com.example.commutemood.application;

import com.example.commutemood.domain.CommuteRecord;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * 通勤记录的读侧去重（任务 D05）。
 *
 * <p>为什么读侧还要去重：D02 的写侧幂等只覆盖"带 {@code operationId} 的新契约"。
 * 下列两类记录仍可能在库里出现同一次通勤的多行：
 * <ol>
 *   <li>历史数据（迁移前写入，没有 {@code operationId}）；</li>
 *   <li>demo 种子与旧客户端路径，{@code operationId} 为 {@code null} 时仓储直接写入。</li>
 * </ol>
 * 因此趋势与历史查询在读取后再按"同一次通勤"折叠一次，保证
 * <b>同一次通勤重复写入不增加趋势次数</b>。
 *
 * <p>折叠口径（优先级从高到低，全部基于同一设备内的记录）：
 * <ul>
 *   <li>{@code operationId} 非空：它就是幂等键，同键即同一次通勤；</li>
 *   <li>{@code snapshotId} 非空：同一快照 + 同一路线 + 同一分钟内完成，视为同一次；</li>
 *   <li>两者都缺（历史记录）：同一路线 + 同一分钟内完成 + 同一压力值，视为同一次。</li>
 * </ul>
 * 分钟级窗口是刻意的保守选择：真实通勤不可能在同一分钟内完成两次，而重放写入几乎总是
 * 落在同一分钟。每组保留 {@code completedAt} 最早的那条。
 */
public final class CommuteRecordDeduplication {

    private CommuteRecordDeduplication() {
    }

    /**
     * 折叠重复写入：先按 {@code completedAt} 升序（{@code null} 排最后）稳定排序，
     * 再保留每组键的第一条，因此结果一定是"同一次通勤里最早写入的那条"，
     * 且不依赖调用方传入的顺序（仓储实现改了排序也不会让趋势口径漂移）。
     *
     * @param records 同一设备的通勤记录，顺序任意
     * @return 去重后、按完成时间升序的不可变列表；入参为 {@code null} 时返回空列表
     */
    public static List<CommuteRecord> deduplicate(List<CommuteRecord> records) {
        if (records == null || records.isEmpty()) {
            return List.of();
        }
        List<CommuteRecord> ordered = records.stream()
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(CommuteRecord::completedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        Set<String> seen = new LinkedHashSet<>();
        List<CommuteRecord> unique = new ArrayList<>(ordered.size());
        for (CommuteRecord record : ordered) {
            if (seen.add(dedupeKey(record))) {
                unique.add(record);
            }
        }
        return List.copyOf(unique);
    }

    /**
     * 统计被折叠掉的重复写入条数，用于响应里显式暴露口径（{@code deduplicatedCommutes}）。
     */
    public static int duplicateCount(List<CommuteRecord> records) {
        if (records == null || records.isEmpty()) {
            return 0;
        }
        long present = records.stream().filter(Objects::nonNull).count();
        return (int) (present - deduplicate(records).size());
    }

    /**
     * 同一次通勤的判定键。仅在单设备记录集合内使用，因此不含 {@code deviceHash}。
     */
    public static String dedupeKey(CommuteRecord record) {
        String operationId = record.operationId();
        if (operationId != null && !operationId.isBlank()) {
            return "op:" + operationId;
        }
        String minute = minuteOf(record.completedAt());
        if (record.snapshotId() != null) {
            return "snap:" + record.snapshotId() + ":" + nullSafe(record.routeId()) + ":" + minute;
        }
        return "legacy:" + nullSafe(record.routeId()) + ":" + minute + ":" + record.endStressLevel();
    }

    private static String minuteOf(Instant completedAt) {
        if (completedAt == null) {
            return "unknown";
        }
        return completedAt.truncatedTo(ChronoUnit.MINUTES).toString();
    }

    private static String nullSafe(String value) {
        return value == null ? "" : value;
    }
}
