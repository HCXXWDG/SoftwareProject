import { DEFAULT_ORIGIN, DEFAULT_DESTINATION } from "./campus";
import type { RouteComparison } from "../types";

/**
 * 后端不可用时的 Mock 路线对比数据。
 *
 * 注意：stressScore / confidence / stressExposure 均为 0。
 * RoutePreviewPage 应检测 isOfflineFallback 并隐藏评分展示，
 * 避免伪造后端评分。
 */
export const MOCK_ROUTE_COMPARISON: RouteComparison = {
  routes: [
    {
      id: "mock-via-east",
      label: "路线 A（东侧步道）",
      distanceMeters: 850,
      durationSeconds: 600,
      stressExposure: 0,
      stressScore: 0,
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
      stressExposure: 0,
      stressScore: 0,
      confidence: 0,
      fastest: false,
      leastStressful: true,
      polyline: [
        DEFAULT_ORIGIN.point,
        { longitude: 120.2732, latitude: 31.477 },
        { longitude: 120.2745, latitude: 31.481 },
        DEFAULT_DESTINATION.point,
      ],
    },
  ],
  fastestRouteId: "mock-via-east",
  leastStressfulRouteId: "mock-via-lake",
  recommendation: "后端暂不可用，仅显示路线走向",
  recommendAlternative: false,
};
