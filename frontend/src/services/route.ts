import { api } from "./api";
import type { RouteComparison, RouteCompareRequest } from "../types";
import { isRouteComparison, normalizeRouteComparison, type RouteComparisonResponse } from "./responseValidators";

/** 路线对比 */
export async function compareRoutes(
  data: RouteCompareRequest,
  signal?: AbortSignal,
): Promise<RouteComparison> {
  const response = await api.post<RouteComparisonResponse>("/api/v1/routes/compare", data, signal, isRouteComparison);
  return normalizeRouteComparison(response);
}
