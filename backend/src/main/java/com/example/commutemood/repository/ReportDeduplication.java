package com.example.commutemood.repository;

import com.example.commutemood.application.GeoMath;
import com.example.commutemood.domain.EmotionReport;

import java.time.Duration;

/**
 * 情绪反馈的去重口径（D04）。
 *
 * <p>同一家设备在 {@link #WINDOW} 内、 {@link #RADIUS_METERS} 半径内的重复反馈只算一次，
 * 不计入新增反馈数。这条规则由 demo（内存）与 postgres（JDBC）两种模式共用：
 * 内存实现直接调用 {@link #isDuplicate}，JDBC 实现在 SQL 里使用同样的两个常量，
 * {@code ReportDeduplicationTest} 会核对 SQL 文本与这里的数值一致，避免两种模式出现相反行为。</p>
 *
 * <p>距离用 {@link GeoMath#distanceMeters} 的大圆距离，与 PostGIS 的
 * {@code ST_DWithin(location::geography, ..., 25)} 口径一致；
 * 旧实现用经纬度方框（约 ±22 米）会与数据库的 25 米圆产生边界差异，此处统一为圆形半径。</p>
 */
public final class ReportDeduplication {

    /** 去重时间窗：报告中时间差在该窗口内（含边界）视为同一次反馈。 */
    public static final Duration WINDOW = Duration.ofMinutes(5);

    /** 去重空间半径（米）。 */
    public static final double RADIUS_METERS = 25.0;

    private ReportDeduplication() {
    }

    /**
     * 判断 candidate 是否是 existing 的重复反馈。
     *
     * <p>只有同一设备之间才谈得上重复；不同设备在同一地点各自反馈是合法的多源数据。</p>
     *
     * @param existing  已存在的记录
     * @param candidate 待写入的记录
     * @return 命中去重返回 true
     */
    public static boolean isDuplicate(EmotionReport existing, EmotionReport candidate) {
        if (existing == null || candidate == null) {
            return false;
        }
        if (existing.deviceHash() == null || !existing.deviceHash().equals(candidate.deviceHash())) {
            return false;
        }
        Duration gap = Duration.between(existing.reportedAt(), candidate.reportedAt()).abs();
        if (gap.compareTo(WINDOW) > 0) {
            return false;
        }
        return GeoMath.distanceMeters(existing.location(), candidate.location()) <= RADIUS_METERS;
    }
}
