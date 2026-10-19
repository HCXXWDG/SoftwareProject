package com.example.commutemood.repository;

/**
 * 情绪反馈查询的数据来源口径。
 *
 * <p>项目同时存在两类记录：用户真实反馈（{@code simulated = false}）与演示/模拟数据
 * （{@code simulated = true}，来自 V3、V5 迁移种子或 {@code DemoDataInitializer}）。
 * 减量规则明确要求“演示数据不能混入真实统计”，因此凡是用于真实统计、验收取数、
 * 报告分析的查询都必须显式使用 {@link #REAL_ONLY}。</p>
 *
 * <p>演示模式（默认 profile）下所有数据都是模拟数据，若强制 REAL_ONLY 热力图会变空，
 * 所以 {@link #ALL} 保留为兼容口径，仅供演示展示使用。</p>
 */
public enum ReportScope {

    /** 只返回真实用户反馈，用于统计、验收与任何对外结论。 */
    REAL_ONLY,

    /** 只返回模拟/演示数据，用于演示数据自检与清理。 */
    SIMULATED_ONLY,

    /** 不区分来源。仅用于演示模式展示，不得作为真实统计口径。 */
    ALL;

    /**
     * 判断一条记录是否落在当前口径内。
     *
     * @param simulated 记录的 {@code simulated} 标记
     * @return 命中返回 true
     */
    public boolean matches(boolean simulated) {
        return switch (this) {
            case REAL_ONLY -> !simulated;
            case SIMULATED_ONLY -> simulated;
            case ALL -> true;
        };
    }
}
