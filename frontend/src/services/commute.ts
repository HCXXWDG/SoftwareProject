import { api } from "./api";
import type { CommuteRecord, CommuteCompleteRequest, TrendResult } from "../types";
import { isCommuteRecord, isTrendResult, type CommuteRecordResponse, type TrendResultResponse } from "./responseValidators";

/** 完成通勤 */
export async function completeCommute(
  data: CommuteCompleteRequest,
  signal?: AbortSignal,
): Promise<CommuteRecord> {
  const result = await api.post<CommuteRecordResponse>("/api/v1/commutes/complete", data, signal, isCommuteRecord);
  return {
    ...result,
    alternativeLabel: result.alternativeLabel ?? null,
    alternativeScore: result.alternativeScore ?? null,
    alternativeDurationRatio: result.alternativeDurationRatio ?? null,
  };
}

/** 获取七日趋势 */
export async function fetchTrends(
  days: number = 7,
  timezone: string = "Asia/Shanghai",
  signal?: AbortSignal,
): Promise<TrendResult> {
  const params = new URLSearchParams({ days: String(days), timezone });
  const result = await api.get<TrendResultResponse>(`/api/v1/commutes/trends?${params}`, signal, isTrendResult);
  return {
    ...result,
    points: result.points.map((entry) => ({ ...entry, averageStress: entry.averageStress ?? null })),
    ...(result.summary ? { summary: {
      ...result.summary,
      averageStress: result.summary.averageStress ?? null,
      stressDelta: result.summary.stressDelta ?? null,
    } } : {}),
  };
}
