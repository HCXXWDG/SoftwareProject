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
      if (!isReportResponse(error.responseBody, error.status) || error.responseBody.status !== "duplicate") {
        throw new ApiError("format", "服务器返回的反馈结果不一致，请稍后重试或联系项目成员核对接口。");
      }
      return { ...error.responseBody, message: error.message };
    }
    throw error;
  }
}
