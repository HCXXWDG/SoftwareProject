import { api } from "./api";
import type { RouteComparison, RouteCompareRequest } from "../types";
import { isRouteComparison } from "./responseValidators";

/** 路线对比 */
export async function compareRoutes(
  data: RouteCompareRequest,
  signal?: AbortSignal,
): Promise<RouteComparison> {
  return api.post<RouteComparison>("/api/v1/routes/compare", data, signal, isRouteComparison);
}
