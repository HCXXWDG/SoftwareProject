import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getApiRequestScope } from "../services/api";
import { completeCommute } from "../services/commute";
import { clearPendingCommute, newPendingCommute, readPendingCommute, savePendingCommute, type PendingCommute } from "../services/pendingCommute";
import type { CommuteCompleteRequest, CommuteCompletion } from "../types";

export type CommuteDraft = Pick<CommuteCompleteRequest, "snapshotId" | "routeId" | "endStressLevel">;
interface Options {
  /** Explicit D07 deployment gate. Restoring data never grants write permission. */
  enabled?: boolean;
  /** A journey revision/snapshot key suppresses stale refresh callbacks after navigation. */
  contextKey?: string;
  onSaved?: (receipt: CommuteCompletion) => void | Promise<void>;
}
interface State {
  phase: "idle" | "pending" | "submitting" | "saved" | "blocked";
  operation: PendingCommute | null;
  receipt: CommuteCompletion | null;
  error: string | null;
  refreshWarning: string | null;
  storageWarning: string | null;
  refreshingQueries: boolean;
}
const initial: State = { phase: "idle", operation: null, receipt: null, error: null, refreshWarning: null, storageWarning: null, refreshingQueries: false };
const changedScope = "当前会话或服务地址已变化。请回到原会话与服务核对上次通勤，不会创建另一笔记录。";
const disabled = "通勤提交仍待接口联合验收，当前不会发送请求。";

function sameOperation(left: PendingCommute, right: PendingCommute): boolean {
  return left.scope === right.scope && left.request.operationId === right.request.operationId
    && left.request.snapshotId === right.request.snapshotId && left.request.routeId === right.request.routeId
    && left.request.endStressLevel === right.request.endStressLevel && left.request.completedAt === right.request.completedAt;
}

function restore(): State {
  const stored = readPendingCommute();
  if (stored.status === "blocked") return { ...initial, phase: "blocked", error: stored.message };
  if (stored.status === "empty") return { ...initial };
  return { ...initial, operation: stored.pending,
    phase: stored.pending.scope === getApiRequestScope() ? "pending" : "blocked",
    error: stored.pending.scope === getApiRequestScope() ? null : changedScope };
}

/** Explicit, same-operation retries only. Restoring this hook never sends a write. */
export function useCommuteOperation(options: Options = {}) {
  const [state, setState] = useState<State>(restore);
  const current = useRef(state);
  const latest = useRef(options);
  latest.current = options;
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const update = useCallback((patch: Partial<State>) => {
    current.current = { ...current.current, ...patch };
    if (mounted.current) setState(current.current);
  }, []);

  const refreshQueries = useCallback(async (receipt: CommuteCompletion, operation: PendingCommute,
    contextKey: string | undefined, onSaved: Options["onSaved"]): Promise<boolean> => {
    const isCurrent = () => mounted.current && operation.scope === getApiRequestScope()
      && contextKey === latest.current.contextKey;
    if (!isCurrent() || !onSaved) return false;
    update({ refreshingQueries: true });
    try {
      await onSaved(receipt);
      if (isCurrent()) update({ refreshWarning: null });
      return true;
    } catch {
      if (isCurrent()) update({ refreshWarning: "通勤已确认，但后续查询刷新失败。请只刷新查询，无需再次提交。" });
      return false;
    } finally { update({ refreshingQueries: false }); }
  }, [update]);

  // Called only under the synchronous begin/retry lock. Persist before every explicit POST.
  const execute = useCallback(async (operation: PendingCommute): Promise<CommuteCompletion | null> => {
    if (!latest.current.enabled) { update({ error: disabled }); return null; }
    if (operation.scope !== getApiRequestScope()) {
      update({ phase: "blocked", operation, error: changedScope }); return null;
    }
    try { savePendingCommute(operation); }
    catch {
      update({ phase: "blocked", operation, error: "无法保留待确认通勤信息，本次未发出请求。请恢复浏览器存储后重试同一次操作。" });
      return null;
    }
    const contextKey = latest.current.contextKey;
    const onSaved = latest.current.onSaved;
    update({ phase: "submitting", operation, receipt: null, error: null, refreshWarning: null, storageWarning: null });
    let receipt: CommuteCompletion;
    try { receipt = await completeCommute(operation.request); }
    catch (failure) {
      const needsReconciliation = failure instanceof ApiError
        && (failure.status === 404 && failure.code === "snapshot_not_found"
          || failure.status === 410 && failure.code === "snapshot_expired");
      const message = needsReconciliation
        ? "路线快照已失效，但不能据此判断上次通勤是否保存。请先核对记录，当前保留原操作信息。"
        : failure instanceof Error ? failure.message : "通勤结果尚待确认，请重试原操作。";
      update({ phase: "pending", operation, error: message });
      return null;
    }
    // completeCommute validates the receipt against this exact snapshot/operation/route/stress.
    const beforeClear = readPendingCommute();
    if (beforeClear.status === "pending" && sameOperation(beforeClear.pending, operation)) {
      clearPendingCommute(operation.request.operationId);
    }
    const remaining = readPendingCommute();
    const sameScope = operation.scope === getApiRequestScope();
    update({ phase: sameScope ? "saved" : "blocked", operation, receipt,
      error: sameScope ? null : changedScope,
      storageWarning: remaining.status === "empty" ? null : "通勤已确认，但仍有恢复信息需核对；开始新通勤前请先确认清理结果。" });
    await refreshQueries(receipt, operation, contextKey, onSaved);
    return receipt;
  }, [refreshQueries, update]);

  const begin = useCallback(async (draft: CommuteDraft): Promise<CommuteCompletion | null> => {
    if (busy.current) return null;
    busy.current = true;
    try {
      if (!latest.current.enabled) { update({ error: disabled }); return null; }
      if (current.current.receipt) {
        update({ error: "本次通勤已确认。请明确开始新的通勤后再提交。" }); return null;
      }
      const stored = readPendingCommute();
      if (stored.status === "blocked") { update({ phase: "blocked", error: stored.message }); return null; }
      const existing = current.current.operation ?? (stored.status === "pending" ? stored.pending : null);
      if (existing) {
        update({ phase: existing.scope === getApiRequestScope() ? "pending" : "blocked", operation: existing,
          error: existing.scope === getApiRequestScope() ? "上次通勤尚待确认，请重试原操作，不能新建另一笔。" : changedScope });
        return null;
      }
      let operation: PendingCommute;
      try { operation = newPendingCommute(draft, getApiRequestScope()); }
      catch { update({ error: "无法建立可恢复的通勤操作，请检查路线、感受及浏览器能力。" }); return null; }
      return await execute(operation);
    } finally { busy.current = false; }
  }, [execute, update]);

  const retry = useCallback(async (): Promise<CommuteCompletion | null> => {
    if (busy.current) return null;
    busy.current = true;
    try {
      const stored = readPendingCommute();
      if (stored.status === "blocked") { update({ phase: "blocked", error: stored.message }); return null; }
      const operation = current.current.operation ?? (stored.status === "pending" ? stored.pending : null);
      if (!operation) { update({ error: "没有待确认的通勤操作。" }); return null; }
      if (operation.scope !== getApiRequestScope()) {
        update({ phase: "blocked", operation, error: changedScope }); return null;
      }
      if (current.current.receipt) return current.current.receipt;
      return await execute(operation);
    } finally { busy.current = false; }
  }, [execute, update]);

  const startNew = useCallback((): boolean => {
    if (busy.current) return false;
    const { receipt, operation } = current.current;
    if (!receipt || !operation) {
      update({ error: "上次通勤尚未确认，不能通过新建操作丢弃原提交信息。" }); return false;
    }
    let stored = readPendingCommute();
    if (stored.status === "pending" && sameOperation(stored.pending, operation)
        && operation.request.operationId === receipt.operationId) {
      clearPendingCommute(receipt.operationId);
      stored = readPendingCommute();
    }
    if (stored.status !== "empty") {
      update({ storageWarning: "仍有待核对的恢复信息，当前不会覆盖或创建新通勤。" }); return false;
    }
    update({ ...initial });
    return true;
  }, [update]);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (busy.current || !current.current.receipt || !current.current.operation) return false;
    busy.current = true;
    try {
      return await refreshQueries(current.current.receipt, current.current.operation,
        latest.current.contextKey, latest.current.onSaved);
    } finally { busy.current = false; }
  }, [refreshQueries]);

  return { ...state, begin, retry, startNew, refresh };
}
