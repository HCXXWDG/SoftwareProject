import { api } from "./api";
import type { ReportRequest } from "../types";

interface ReportResponse {
  status: string;
  message: string;
}

/** 提交情绪报告 */
export async function submitReport(
  data: ReportRequest
): Promise<ReportResponse> {
  return api.post<ReportResponse>("/api/v1/reports", data);
}
