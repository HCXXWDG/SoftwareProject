package com.example.commutemood.application;

import com.example.commutemood.api.dto.CommuteHistoryItem;
import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.RouteSource;
import com.example.commutemood.repository.CommuteRecordRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 通勤历史明细查询（任务 D05：调整历史查询结构，兼容缺字段的旧记录）。
 *
 * <p>与 {@link TrendService} 共用同一套口径，避免"趋势说 7 次、历史列出 9 条"：
 * <ul>
 *   <li>窗口同样是"请求时区下的自然日"，{@code days=7} 表示今天在内的最近 7 个自然日；</li>
 *   <li>同样先用 {@link CommuteRecordDeduplication} 折叠重复写入，再排序截断；</li>
 *   <li>来源为 {@link RouteSource#DEMO} 的记录<b>不出现</b>在历史里——演示结果既不进入
 *       真实统计，也不该混进用户自己的通勤明细；</li>
 *   <li>缺 {@code operationId}/{@code snapshotId}/{@code estimatedSeconds} 的旧记录
 *       照常返回，但用 {@code legacyRecord} 与 {@code missingFields} 显式标记，
 *       前端不必猜测、也不会解析失败；来源未知只体现在 {@code routeSource="UNKNOWN"}，
 *       不算旧记录（B04 交付前新记录同样是 UNKNOWN）。</li>
 * </ul>
 *
 * <p>返回按 {@code completedAt} 倒序（最近一次在最前），最多 {@code limit} 条。
 */
@Service
public class CommuteHistoryService {

    /** 单次最多返回条数，防止前端一次拉走整库。 */
    private static final int MAX_LIMIT = 100;
    /** 历史回溯上限（自然日）。 */
    private static final int MAX_DAYS = 90;

    private final CommuteRecordRepository repository;
    private final DeviceIdentityService identityService;

    public CommuteHistoryService(
            CommuteRecordRepository repository,
            DeviceIdentityService identityService
    ) {
        this.repository = repository;
        this.identityService = identityService;
    }

    /**
     * @param rawDeviceId 前端匿名设备 ID（与趋势接口同一个 {@code X-Device-Id}）
     * @param limit       返回条数上限，1 至 {@value #MAX_LIMIT}
     * @param days        回溯自然日天数，1 至 {@value #MAX_DAYS}
     * @param zoneId      分日与窗口所用时区
     */
    public List<CommuteHistoryItem> getHistory(String rawDeviceId, int limit, int days, ZoneId zoneId) {
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("limit must be between 1 and " + MAX_LIMIT);
        }
        if (days < 1 || days > MAX_DAYS) {
            throw new IllegalArgumentException("days must be between 1 and " + MAX_DAYS);
        }
        if (zoneId == null) {
            throw new IllegalArgumentException("timezone is required");
        }
        String deviceHash = identityService.hash(rawDeviceId);
        LocalDate today = LocalDate.now(zoneId);
        Instant since = today.minusDays(days - 1L).atStartOfDay(zoneId).toInstant();

        List<CommuteRecord> records = CommuteRecordDeduplication
                .deduplicate(repository.findByDeviceSince(deviceHash, since));

        return records.stream()
                .filter(record -> record.completedAt() != null)
                .filter(record -> record.routeSource() != RouteSource.DEMO)
                .sorted(Comparator.comparing(CommuteRecord::completedAt).reversed())
                .limit(limit)
                .map(record -> toItem(record, zoneId))
                .toList();
    }

    private CommuteHistoryItem toItem(CommuteRecord record, ZoneId zoneId) {
        RouteSource source = record.routeSource() == null ? RouteSource.UNKNOWN : record.routeSource();
        List<String> missing = new ArrayList<>(4);
        if (record.operationId() == null || record.operationId().isBlank()) {
            missing.add(CommuteHistoryItem.MISSING_OPERATION_ID);
        }
        if (record.snapshotId() == null) {
            missing.add(CommuteHistoryItem.MISSING_SNAPSHOT_ID);
        }
        if (record.estimatedSeconds() == null) {
            missing.add(CommuteHistoryItem.MISSING_ESTIMATED_SECONDS);
        }
        // 来源未知不算"缺字段"：routeSource 永远有值，UNKNOWN 由前端按来源角标处理。
        // 在 B04 交付快照来源之前，所有新记录也会是 UNKNOWN，若算作 legacy 会误标新数据。
        return new CommuteHistoryItem(
                record.id(),
                record.completedAt(),
                record.completedAt().atZone(zoneId).toLocalDate(),
                zoneId.getId(),
                record.routeId(),
                record.routeLabel(),
                source.name(),
                record.endStressLevel(),
                record.estimatedSeconds(),
                record.durationMinutes(),
                record.selectedScore(),
                record.fastestScore(),
                record.alternativeLabel(),
                record.alternativeScore(),
                record.alternativeDurationRatio(),
                record.confidence(),
                record.operationId(),
                record.snapshotId(),
                !missing.isEmpty(),
                List.copyOf(missing));
    }
}
