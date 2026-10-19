import { api, ApiError } from "./api";
import type { CommuteCompletion, CommuteCompletionConflict, CommuteCompleteRequest, TrendResult } from "../types";
import { isCompatibleTrendResult, normalizeTrendResult, type CompatibleTrendResultResponse } from "./trendResponse";
import { isCommuteCompleteRequest, isCommuteCompletion, isCommuteCompletionConflict, matchesCommuteRequest } from "./commuteCompletionValidators";

/** A conflict retains the existing record references so a future UI can ask for review. */
export class CommuteCompletionConflictError extends ApiError {
  readonly conflict: CommuteCompletionConflict;

  constructor(conflict: CommuteCompletionConflict) {
    super("business", "本次操作标识已用于其他通勤内容，请核对已记录的通勤后再操作。", {
      status: 409, code: "operation_conflict", responseBody: conflict,
    });
    this.name = "CommuteCompletionConflictError";
    this.conflict = conflict;
  }
}

/** D02 snapshot-only completion; the caller owns stable operation IDs and explicit retries. */
export async function completeCommute(
  data: CommuteCompleteRequest,
  signal?: AbortSignal,
): Promise<CommuteCompletion> {
  if (!isCommuteCompleteRequest(data)) {
    throw new ApiError("business", "通勤提交信息有误，请重新规划路线并检查到达感受。", {
      status: 400, code: "invalid_request",
    });
  }
  // Never forward scoring, labels, durations or arbitrary extra properties from a cast object.
  const request: CommuteCompleteRequest = {
    snapshotId: data.snapshotId,
    operationId: data.operationId,
    routeId: data.routeId,
    endStressLevel: data.endStressLevel,
    ...(data.completedAt === undefined ? {} : { completedAt: data.completedAt }),
  };
  try {
    const validate = (value: unknown, status?: number): value is CommuteCompletion =>
      isCommuteCompletion(value, status) && matchesCommuteRequest(value, request);
    return await api.post<CommuteCompletion>("/api/v1/commutes/complete", request, signal, validate);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 409 && isCommuteCompletionConflict(error.responseBody)) {
      if (error.responseBody.operationId !== request.operationId) {
        throw new ApiError("format", "服务器返回的通勤冲突与本次操作不一致，请核对接口。", { status: 409 });
      }
      throw new CommuteCompletionConflictError(error.responseBody);
    }
    const knownErrors: Record<string, { status: number; message: string }> = {
      snapshot_not_found: { status: 404, message: "路线快照不存在或不属于当前设备，请重新规划路线。" },
      snapshot_expired: { status: 410, message: "路线结果已过期，请重新规划后再完成通勤。" },
      demo_result_not_allowed: { status: 422, message: "演示路线结果不计入真实通勤统计，请重新查询真实路线。" },
      invalid_request: { status: 400, message: "通勤提交信息有误，请检查后重试。" },
    };
    const known = error.code ? knownErrors[error.code] : undefined;
    if (known && error.status === known.status) {
      throw new ApiError("business", known.message, {
        status: error.status, code: error.code, responseBody: error.responseBody,
      });
    }
    throw error;
  }
}

/** 获取七日趋势 */
export async function fetchTrends(
  days: number = 7,
  timezone: string = "Asia/Shanghai",
  signal?: AbortSignal,
): Promise<TrendResult> {
  const params = new URLSearchParams({ days: String(days), timezone });
  const result = await api.get<CompatibleTrendResultResponse>(`/api/v1/commutes/trends?${params}`, signal, isCompatibleTrendResult);
  return normalizeTrendResult(result);
}
