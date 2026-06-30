import type { GeoPoint, RouteComparison, ScoredRoute } from "../types";

/* ── helpers ── */

function haversine(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function polylineDistance(pts: GeoPoint[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]);
  return d;
}

/**
 * 沿 origin→destination 直线生成一条带正弦扰动的曲线路径。
 * @param n      路径点数量（含起终点）
 * @param amp    最大垂直偏移（米）
 * @param freq   正弦波频率（π 的倍数）
 * @param phase  相位偏移
 */
function generateCurvedPath(
  origin: GeoPoint,
  destination: GeoPoint,
  n: number,
  amp: number,
  freq: number,
  phase: number,
): GeoPoint[] {
  const dLat = destination.latitude - origin.latitude;
  const dLng = destination.longitude - origin.longitude;
  const dist = haversine(origin, destination);
  if (dist < 1) return [origin, destination];

  // 垂直于行进方向的单位向量（约 1°≈111km）
  const pLng = -dLat / dist / 111000 * dist;
  const pLat = dLng / dist / 111000 * dist;

  const pts: GeoPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // 基础线性插值
    const lat = origin.latitude + dLat * t;
    const lng = origin.longitude + dLng * t;
    // 正弦偏移（起终点为 0，中间最大）
    const offset = amp * Math.sin(Math.PI * t) * Math.sin(freq * Math.PI * t + phase);
    pts.push({
      longitude: lng + pLng * offset,
      latitude: lat + pLat * offset,
    });
  }
  return pts;
}

/* ── public API ── */

/**
 * 根据起终点动态生成 3 条 Mock 路线（最快 / 最少心累 / 风景路线）。
 * polyline 使用正弦扰动模拟道路弯曲，每条路线 15-22 个路径点。
 */
export function generateMockRoutes(
  origin: GeoPoint,
  destination: GeoPoint,
): RouteComparison {
  // 路线变体定义
  const variants = [
    {
      id: "mock-fast",
      label: "路线 A（快捷路线）",
      n: 14,
      amp: 12,
      freq: 1.0,
      phase: 0.3,
      distFactor: 1.08,
      fastest: true,
      leastStressful: false,
    },
    {
      id: "mock-calm",
      label: "路线 B（舒适路线）",
      n: 18,
      amp: 22,
      freq: 1.5,
      phase: 0.8,
      distFactor: 1.25,
      fastest: false,
      leastStressful: true,
    },
    {
      id: "mock-scenic",
      label: "路线 C（风景路线）",
      n: 22,
      amp: 35,
      freq: 2.0,
      phase: 1.2,
      distFactor: 1.45,
      fastest: false,
      leastStressful: false,
    },
  ];

  const routes: ScoredRoute[] = variants.map((v) => {
    const polyline = generateCurvedPath(origin, destination, v.n, v.amp, v.freq, v.phase);
    const rawDist = polylineDistance(polyline);
    // 使用 factor 调整距离以区分路线特性
    const distanceMeters = Math.round(rawDist * v.distFactor);
    // 步行速度 ≈ 1.2 m/s，快捷路线更快
    const speed = v.fastest ? 1.3 : v.leastStressful ? 1.15 : 1.0;
    const durationSeconds = Math.round(distanceMeters / speed);
    // 心累评分：舒适路线最低，风景路线中等，快捷路线偏高
    const stressScore = v.fastest ? 45 : v.leastStressful ? 22 : 38;
    const confidence = v.fastest ? 0.85 : v.leastStressful ? 0.78 : 0.65;
    const stressExposure = v.fastest ? 0.42 : v.leastStressful ? 0.18 : 0.30;

    return {
      id: v.id,
      label: v.label,
      distanceMeters,
      durationSeconds,
      stressExposure,
      stressScore,
      confidence,
      fastest: v.fastest,
      leastStressful: v.leastStressful,
      polyline,
    };
  });

  const fastestRouteId = routes.find((r) => r.fastest)!.id;
  const leastStressfulRouteId = routes.find((r) => r.leastStressful)!.id;

  return {
    routes,
    fastestRouteId,
    leastStressfulRouteId,
    recommendation: `推荐路线 B（舒适路线）：心累指数最低，适合日常通勤`,
    recommendAlternative: true,
  };
}
