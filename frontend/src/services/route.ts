import { api } from "./api";
import type { RouteComparison, RouteCompareRequest } from "../types";

/** 路线对比 */
export async function compareRoutes(
  data: RouteCompareRequest
): Promise<RouteComparison> {
  return api.post<RouteComparison>("/api/v1/routes/compare", data);
}
