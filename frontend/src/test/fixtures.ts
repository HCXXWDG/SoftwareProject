import { DEFAULT_DESTINATION, DEFAULT_ORIGIN } from "../config/serviceArea";
import type { RouteComparison, TrendResult } from "../types";

export const routeComparison: RouteComparison = {
  routes: [{ id: "r1", label: "路线 A（东侧步道）", distanceMeters: 850, durationSeconds: 600,
    stressExposure: 0.4, stressScore: 38, confidence: 0.85, fastest: true, leastStressful: false,
    polyline: [DEFAULT_ORIGIN.point, DEFAULT_DESTINATION.point] },
  { id: "r2", label: "路线 B（蠡湖环路）", distanceMeters: 1100, durationSeconds: 780,
    stressExposure: 0.2, stressScore: 22, confidence: 0.78, fastest: false, leastStressful: true,
    polyline: [DEFAULT_ORIGIN.point, DEFAULT_DESTINATION.point] }],
  fastestRouteId: "r1", leastStressfulRouteId: "r2", recommendation: "推荐路线 B（最少心累）", recommendAlternative: true,
};
export const emptyTrend: TrendResult = { points: [], recommendation: "暂无记录", totalCommutes: 0 };
export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
export function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
