-- V4：通勤幂等、快照溯源、来源与预计时长（成员 D，任务 D02/D03）
-- 只新增，不改写已执行的 V1~V3；新列对历史记录全部可空，保证旧库升级后既有行仍可解析。

ALTER TABLE commute_record
    ADD COLUMN operation_id      VARCHAR(80),
    ADD COLUMN snapshot_id       UUID,
    ADD COLUMN route_source      VARCHAR(16),
    ADD COLUMN estimated_seconds INTEGER;

-- 预计秒数若存在必须为正；历史行为 NULL，不受约束影响。
ALTER TABLE commute_record
    ADD CONSTRAINT chk_commute_estimated_seconds
        CHECK (estimated_seconds IS NULL OR estimated_seconds > 0);

-- 幂等唯一约束：同一设备的同一操作 ID 至多一条。
-- 使用部分唯一索引，历史行 operation_id 为 NULL 时不参与冲突（多条 NULL 互不冲突）。
CREATE UNIQUE INDEX uq_commute_device_operation
    ON commute_record (device_hash, operation_id)
    WHERE operation_id IS NOT NULL;

-- 便于按快照溯源本次通勤依据的比较结果。
CREATE INDEX idx_commute_record_snapshot
    ON commute_record (snapshot_id);
