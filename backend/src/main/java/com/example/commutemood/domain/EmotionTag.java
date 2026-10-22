package com.example.commutemood.domain;

/**
 * 情绪反馈标签。
 *
 * <p>枚举名称必须与以下三处保持一致，任何新增标签都要同步修改，否则会出现
 * “前端能选、后端 400” 或 “后端能存、数据库约束报错” 的断裂：</p>
 * <ol>
 *   <li>数据库约束：V1 建表的 {@code emotion_report_tag_check}，由 V5 迁移扩展；</li>
 *   <li>种子数据：V3/V5 的演示数据与 {@code DemoDataInitializer}；</li>
 *   <li>前端类型：{@code frontend/src/types/index.ts} 的 {@code EmotionTag}（A 维护，C03 使用）。</li>
 * </ol>
 *
 * <p>NOISE/CROWD/SUN/ODOR 为负面成因标签，QUIET/SHADE/OPEN 为 C03 新增的正向原因标签，
 * OTHER 为兜底。展示用的中文名与 emoji 由前端负责，后端只存枚举名。</p>
 */
public enum EmotionTag {
    NOISE,
    CROWD,
    SUN,
    ODOR,
    QUIET,
    SHADE,
    OPEN,
    OTHER
}
