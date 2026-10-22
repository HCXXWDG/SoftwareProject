import { DEFAULT_ORIGIN, DEFAULT_DESTINATION } from "./campus";
import type { GeoPoint, RouteComparison } from "../types";

/**
 * 后端不可用时的 Mock 路线对比数据。
 *
 * 缺失评分为 null，confidence 为 0。
 * RoutePreviewPage 应检测 isOfflineFallback 并隐藏评分展示，
 * 避免伪造后端评分。
 */
export const MOCK_ROUTE_COMPARISON: RouteComparison = {
  routeSource: "DEMO", feedbackSource: "NONE", scoringStatus: "UNAVAILABLE",
  routes: [
    {
      id: "mock-via-east",
      label: "路线 A（东侧步道）",
      distanceMeters: 850,
      durationSeconds: 600,
      stressExposure: null,
      stressScore: null,
      confidence: 0,
      fastest: true,
      leastStressful: false,
      polyline: [
        DEFAULT_ORIGIN.point,
        { longitude: 120.2738, latitude: 31.478 },
        { longitude: 120.2741, latitude: 31.481 },
        DEFAULT_DESTINATION.point,
      ],
    },
    {
      id: "mock-via-lake",
      label: "路线 B（蠡湖环路）",
      distanceMeters: 1100,
      durationSeconds: 780,
      stressExposure: null,
      stressScore: null,
      confidence: 0,
      fastest: false,
      leastStressful: false,
      polyline: [
        DEFAULT_ORIGIN.point,
        { longitude: 120.2732, latitude: 31.477 },
        { longitude: 120.2745, latitude: 31.481 },
        DEFAULT_DESTINATION.point,
      ],
    },
  ],
  fastestRouteId: "mock-via-east",
  leastStressfulRouteId: null,
  recommendation: "后端暂不可用，仅显示路线走向",
  recommendAlternative: false,
};

/** 仅提供明确配置的端点组合，不能将默认折线套用到其他位置。 */
export function findDemoRoutes(origin: GeoPoint, destination: GeoPoint): RouteComparison | null {
  const same = (a: GeoPoint, b: GeoPoint) => Math.abs(a.longitude - b.longitude) < 0.000001 && Math.abs(a.latitude - b.latitude) < 0.000001;
  return same(origin, DEFAULT_ORIGIN.point) && same(destination, DEFAULT_DESTINATION.point) ? MOCK_ROUTE_COMPARISON : null;
}
