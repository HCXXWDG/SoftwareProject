import type { CommuteCompleteRequest, CommuteCompletion, CommuteCompletionConflict } from "../types";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const uuid = (value: unknown): value is string => text(value)
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const score = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const stress = (value: unknown): value is CommuteCompleteRequest["endStressLevel"] =>
  score(value) && [0, 25, 50, 75, 100].includes(value);
const timestamp = (value: unknown): value is string => text(value)
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value));

/** Runtime callers cannot bypass the snapshot-only request contract with a cast. */
export function isCommuteCompleteRequest(value: unknown): value is CommuteCompleteRequest {
  return record(value) && uuid(value.snapshotId) && text(value.operationId)
    && value.operationId.length <= 80 && text(value.routeId) && stress(value.endStressLevel)
    && (value.completedAt === undefined || timestamp(value.completedAt));
}

export type CompatibleCommuteCompletion = Omit<CommuteCompletion, "selectedScore"> & { selectedScore?: number | null };

/** D07 NON_NULL responses may omit scores; bounds remain strict when a score is present. */
export function isCommuteCompletion(value: unknown, httpStatus?: number): value is CompatibleCommuteCompletion {
  if (!record(value) || (value.status !== "created" && value.status !== "duplicate")) return false;
  if (httpStatus !== undefined && httpStatus !== (value.status === "created" ? 201 : 200)) return false;
  return uuid(value.commuteId) && uuid(value.snapshotId) && text(value.operationId)
    && value.operationId.length <= 80 && text(value.routeId) && text(value.routeLabel)
    && (value.routeSource === "REAL" || value.routeSource === "DEMO" || value.routeSource === "UNKNOWN")
    && positiveInteger(value.estimatedSeconds) && positiveInteger(value.durationMinutes)
    && value.durationMinutes === Math.ceil(value.estimatedSeconds / 60)
    && (value.selectedScore == null || score(value.selectedScore)) && stress(value.endStressLevel)
    && timestamp(value.completedAt) && text(value.message);
}

export function matchesCommuteRequest(result: CompatibleCommuteCompletion, input: CommuteCompleteRequest): boolean {
  return result.operationId === input.operationId && result.snapshotId.toLowerCase() === input.snapshotId.toLowerCase()
    && result.routeId === input.routeId && result.endStressLevel === input.endStressLevel;
}

export function isCommuteCompletionConflict(value: unknown): value is CommuteCompletionConflict {
  return record(value) && value.status === "conflict" && text(value.operationId) && text(value.message)
    && (value.existingCommuteId === undefined || uuid(value.existingCommuteId))
    && (value.existingSnapshotId === undefined || uuid(value.existingSnapshotId))
    && (value.existingRouteId === undefined || text(value.existingRouteId));
}
