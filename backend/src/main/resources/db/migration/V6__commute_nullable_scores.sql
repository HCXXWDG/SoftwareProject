-- V6：通勤评分可空（成员 D，任务 D07，配合 B 的 #67 快照评分状态）
--
-- 背景：B 的 #67 让路线快照在"没有可验证评分"时不再补造分数——
-- ScoredRoute.stressScore / stressExposure 变为可空，并带 ScoringStatus
-- （VALID / INSUFFICIENT_DATA / UNAVAILABLE）。典型场景是真实用户的第一次通勤：
-- 路线服务可用，但沿途还没有任何真实反馈，因此算不出压力评分。
--
-- 这种通勤必须能落库（否则用户的第一次记录直接丢失），但评分不能写成 0
-- （否则趋势均值被假数据拉低，前端也会把"没有评分"显示成"压力 0 分"）。
-- 所以 selected_score / fastest_score / confidence 三列改为可空，缺就是 NULL。
--
-- 只放宽约束，不改写 V1~V5；已有行全部有值，不受影响。

ALTER TABLE commute_record
    ALTER COLUMN selected_score DROP NOT NULL,
    ALTER COLUMN fastest_score  DROP NOT NULL,
    ALTER COLUMN confidence     DROP NOT NULL;

-- 评分若存在必须落在合法区间；为 NULL 时不受约束影响。
-- V1 只在列上写了 NOT NULL，没有取值范围检查，这里一并补上，避免脏值（负分、超过 100）落库。
ALTER TABLE commute_record
    ADD CONSTRAINT chk_commute_selected_score
        CHECK (selected_score IS NULL OR (selected_score >= 0 AND selected_score <= 100)),
    ADD CONSTRAINT chk_commute_fastest_score
        CHECK (fastest_score IS NULL OR (fastest_score >= 0 AND fastest_score <= 100)),
    ADD CONSTRAINT chk_commute_confidence
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

COMMENT ON COLUMN commute_record.selected_score IS
    '选中路线的服务端压力评分；NULL 表示该次通勤没有可验证评分（如沿途尚无真实反馈），不是 0 分。';
COMMENT ON COLUMN commute_record.fastest_score IS
    '最快路线的服务端压力评分；NULL 含义同 selected_score。';
COMMENT ON COLUMN commute_record.confidence IS
    '评分置信度 0~1；NULL 表示无有效评分，读侧不应把它当作 0 参与推荐判断。';
