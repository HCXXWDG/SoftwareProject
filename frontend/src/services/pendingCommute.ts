import type { CommuteCompleteRequest } from "../types";
import { isCommuteCompleteRequest } from "./commuteCompletionValidators";

export type PendingCommute = {
  version: 1;
  /** Opaque local request-session and service scope; never sent to the server. */
  scope: string;
  request: Readonly<CommuteCompleteRequest>;
};

export type ReadPending =
  | { status: "empty" }
  | { status: "pending"; pending: PendingCommute }
  | { status: "blocked"; message: string };

const STORAGE_KEY = "commute-pending-v1";
const READ_ERROR = "无法读取待确认通勤，暂不能创建新的通勤提交。";
const INVALID_ERROR = "待确认通勤内容损坏或版本不兼容，请先核对原提交。";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Copy only the wire-contract fields, retaining their original values. */
function copyPending(value: unknown): PendingCommute | null {
  if (!record(value) || value.version !== 1 || typeof value.scope !== "string"
    || !value.scope.trim() || !record(value.request)) return null;
  const input = value.request;
  const request = {
    snapshotId: input.snapshotId,
    operationId: input.operationId,
    routeId: input.routeId,
    endStressLevel: input.endStressLevel,
    ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
  };
  if (!isCommuteCompleteRequest(request)) return null;
  return Object.freeze({ version: 1, scope: value.scope, request: Object.freeze(request) });
}

function samePending(left: PendingCommute, right: PendingCommute): boolean {
  return left.scope === right.scope
    && left.request.operationId === right.request.operationId
    && left.request.snapshotId === right.request.snapshotId
    && left.request.routeId === right.request.routeId
    && left.request.endStressLevel === right.request.endStressLevel
    && left.request.completedAt === right.request.completedAt;
}

export function readPendingCommute(): ReadPending {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === null) return { status: "empty" };
    const pending = copyPending(JSON.parse(stored));
    return pending ? { status: "pending", pending } : { status: "blocked", message: INVALID_ERROR };
  } catch {
    return { status: "blocked", message: READ_ERROR };
  }
}

/** A failed write/read-back must prevent the caller from issuing a new POST. */
export function savePendingCommute(pending: PendingCommute): void {
  const copy = copyPending(pending);
  if (!copy) throw new Error("通勤提交信息无效，未保存待确认通勤。");
  const previous = readPendingCommute();
  if (previous.status === "blocked") throw new Error(previous.message);
  if (previous.status === "pending" && !samePending(previous.pending, copy)) {
    throw new Error("已有其他待确认通勤，不能覆盖原操作或修改其提交内容。");
  }
  const serialized = JSON.stringify(copy);
  try {
    sessionStorage.setItem(STORAGE_KEY, serialized);
    if (sessionStorage.getItem(STORAGE_KEY) !== serialized) {
      throw new Error("read-back mismatch");
    }
  } catch {
    throw new Error("无法可靠保存待确认通勤，本次提交尚未发送，请检查浏览器存储权限。");
  }
}

/** Leave corrupt content and other operations intact for explicit review. */
export function clearPendingCommute(operationId: string): boolean {
  const current = readPendingCommute();
  if (current.status !== "pending" || current.pending.request.operationId !== operationId) return false;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    return sessionStorage.getItem(STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

function newOperationId(): string {
  let secure: Crypto | undefined;
  try { secure = globalThis.crypto; } catch { /* Try no insecure fallback. */ }
  if (typeof secure?.randomUUID === "function") {
    try { return secure.randomUUID(); } catch { /* Older contexts may still support getRandomValues. */ }
  }
  if (typeof secure?.getRandomValues === "function") {
    try {
      const bytes = new Uint8Array(16);
      secure.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
    } catch { /* Creation remains blocked without a secure operation ID. */ }
  }
  throw new Error("当前环境无法安全生成通勤操作标识，暂不能创建通勤提交。");
}

export function newPendingCommute(
  input: Pick<CommuteCompleteRequest, "snapshotId" | "routeId" | "endStressLevel">,
  scope: string,
): PendingCommute {
  const pending = copyPending({
    version: 1,
    scope,
    request: {
      snapshotId: input.snapshotId,
      routeId: input.routeId,
      endStressLevel: input.endStressLevel,
      operationId: newOperationId(),
      completedAt: new Date().toISOString(),
    },
  });
  if (!pending) throw new Error("通勤提交信息无效，无法创建待确认通勤。");
  return pending;
}
