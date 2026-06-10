import { api } from "./api";
import type { CommuteRecord, CommuteCompleteRequest, TrendResult } from "../types";

/** 完成通勤 */
export async function completeCommute(
  data: CommuteCompleteRequest
): Promise<CommuteRecord> {
  return api.post<CommuteRecord>("/api/v1/commutes/complete", data);
}

/** 获取七日趋势 */
export async function fetchTrends(
  days: number = 7,
  timezone: string = "Asia/Shanghai"
): Promise<TrendResult> {
  const params = new URLSearchParams({ days: String(days), timezone });
  return api.get<TrendResult>(`/api/v1/commutes/trends?${params}`);
}
