import { api, ApiError } from "./api";
import type { ReportRequest } from "../types";
import { isReportResponse, type ReportResponse } from "./responseValidators";
export type { ReportResponse } from "./responseValidators";

/** 提交情绪报告 */
export async function submitReport(
  data: ReportRequest,
  signal?: AbortSignal,
): Promise<ReportResponse> {
  try {
    return await api.post<ReportResponse>("/api/v1/reports", data, signal, isReportResponse);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && error.code === "duplicate") {
      return { status: "duplicate", message: error.message };
    }
    throw error;
  }
}
