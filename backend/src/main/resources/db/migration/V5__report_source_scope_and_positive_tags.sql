-- V5: D03 来源隔离与正向标签
-- 1) 把 C03 新增的正向标签（安静/树荫/开阔）纳入 emotion_report.tag 约束；
-- 2) 为“只查真实反馈”的来源口径建立部分索引；
-- 3) 给演示种子补齐正向标签样本，保证 demo 与 postgres 两种模式都能看到新标签。
-- 不修改已执行的 V1~V4。

-- 1) 扩展标签约束（V1 中该约束为列内联 CHECK，PostgreSQL 自动命名为 emotion_report_tag_check）
ALTER TABLE emotion_report
    DROP CONSTRAINT IF EXISTS emotion_report_tag_check;

ALTER TABLE emotion_report
    ADD CONSTRAINT emotion_report_tag_check
    CHECK (tag IN ('NOISE', 'CROWD', 'SUN', 'ODOR', 'QUIET', 'SHADE', 'OPEN', 'OTHER'));

COMMENT ON COLUMN emotion_report.simulated IS
    'true=演示/模拟数据，不得进入真实统计；false=真实用户反馈。查询口径见 ReportScope。';

-- 2) 真实反馈的部分索引：REAL_ONLY 查询按时间与空间过滤时可直接命中
CREATE INDEX IF NOT EXISTS idx_emotion_report_real_reported_at
    ON emotion_report (reported_at DESC)
    WHERE simulated = FALSE;

CREATE INDEX IF NOT EXISTS idx_emotion_report_real_location
    ON emotion_report USING GIST (location)
    WHERE simulated = FALSE;

-- 3) 演示种子补齐正向标签（全部 simulated = TRUE）
WITH positive_clusters(cluster_index, base_longitude, base_latitude, spread) AS (
    VALUES
        (0, 120.2680, 31.4810, 0.0014),
        (1, 120.2730, 31.4760, 0.0010)
),
generated_reports AS (
    SELECT
        report_index,
        'simulated-positive-' || report_index AS device_hash,
        base_longitude + ((((report_index * 41) % 200) - 100) / 100.0) * spread AS longitude,
        base_latitude + ((((report_index * 67) % 200) - 100) / 100.0) * spread AS latitude,
        CASE WHEN report_index % 3 = 0 THEN 0 ELSE 25 END AS stress_level,
        CASE report_index % 3
            WHEN 0 THEN 'QUIET'
            WHEN 1 THEN 'SHADE'
            ELSE 'OPEN'
        END AS tag,
        now() - (((report_index * 13) % 120) * interval '1 hour') AS reported_at
    FROM generate_series(0, 59) AS series(report_index)
    JOIN positive_clusters ON positive_clusters.cluster_index = report_index % 2
)
INSERT INTO device_profile(device_hash, first_seen_at, last_seen_at)
SELECT device_hash, min(reported_at), max(reported_at)
FROM generated_reports
GROUP BY device_hash
ON CONFLICT (device_hash)
DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;

WITH positive_clusters(cluster_index, base_longitude, base_latitude, spread) AS (
    VALUES
        (0, 120.2680, 31.4810, 0.0014),
        (1, 120.2730, 31.4760, 0.0010)
),
generated_reports AS (
    SELECT
        report_index,
        'simulated-positive-' || report_index AS device_hash,
        base_longitude + ((((report_index * 41) % 200) - 100) / 100.0) * spread AS longitude,
        base_latitude + ((((report_index * 67) % 200) - 100) / 100.0) * spread AS latitude,
        CASE WHEN report_index % 3 = 0 THEN 0 ELSE 25 END AS stress_level,
        CASE report_index % 3
            WHEN 0 THEN 'QUIET'
            WHEN 1 THEN 'SHADE'
            ELSE 'OPEN'
        END AS tag,
        now() - (((report_index * 13) % 120) * interval '1 hour') AS reported_at
    FROM generate_series(0, 59) AS series(report_index)
    JOIN positive_clusters ON positive_clusters.cluster_index = report_index % 2
)
INSERT INTO emotion_report(device_hash, stress_level, tag, location, reported_at, simulated)
SELECT
    device_hash,
    stress_level,
    tag,
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
    reported_at,
    TRUE
FROM generated_reports;
