package com.example.commutemood.repository;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.GeoBounds;

import java.time.Instant;
import java.util.List;

public interface EmotionReportRepository {
    SaveOutcome save(EmotionReport report);

    /**
     * 按来源口径查询范围内的反馈记录。
     *
     * <p>真实统计必须传 {@link ReportScope#REAL_ONLY}，避免演示种子数据混入结论；
     * 内存实现与 JDBC 实现的筛选规则完全一致（时间下界闭区间、边界框闭区间、
     * 按 {@code simulated} 过滤）。</p>
     *
     * @param bounds 经纬度边界框
     * @param since  时间下界（含）
     * @param scope  来源口径，不允许为 null
     * @return 命中的记录，无结果时返回空列表
     */
    List<EmotionReport> findWithin(GeoBounds bounds, Instant since, ReportScope scope);

    /**
     * 兼容旧调用的两参重载，口径固定为 {@link ReportScope#ALL}。
     *
     * <p>保留它是为了演示模式（默认 profile）下热力图仍能显示 V3/V5 种子数据；
     * 新代码不要使用这个重载，请显式指定 {@link ReportScope}。</p>
     */
    default List<EmotionReport> findWithin(GeoBounds bounds, Instant since) {
        return findWithin(bounds, since, ReportScope.ALL);
    }
}
