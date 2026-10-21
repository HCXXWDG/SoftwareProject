import type { GeoPoint, HeatmapCell } from "../types";

/** 根据 id 查找点位 */
export function findWaypoint(id: string): Waypoint | undefined {
  return WAYPOINTS.find((w) => w.id === id);
}

export interface Waypoint {
  id: string;
  name: string;
  point: GeoPoint;
}

/** 五个校内导航点位（GCJ-02） */
export const WAYPOINTS: Waypoint[] = [
  { id: "dorm",     name: "学生公寓区", point: { longitude: 120.273510, latitude: 31.475328 } },
  { id: "teaching", name: "第一教学楼", point: { longitude: 120.274319, latitude: 31.483275 } },
  { id: "library",  name: "图书馆",     point: { longitude: 120.273019, latitude: 31.482245 } },
  { id: "canteen",  name: "三食堂",     point: { longitude: 120.272137, latitude: 31.477660 } },
  { id: "sports",   name: "体育中心",   point: { longitude: 120.275344, latitude: 31.487085 } },
];

/** 默认起点（学生公寓区） */
export const DEFAULT_ORIGIN = WAYPOINTS[0];
/** 默认终点（第一教学楼） */
export const DEFAULT_DESTINATION = WAYPOINTS[1];

/** 校区中心（用于默认地图视口） */
export const CAMPUS = {
  /** 校区中心 */
  center: { longitude: 120.273915, latitude: 31.479302 } as GeoPoint,
  /** 可视域边界（蠡湖校区边界外扩约 200 米） */
  bounds: {
    south: 31.47278,
    west: 120.26067,
    north: 31.49417,
    east: 120.27946,
  },
  /** 最小缩放级别 */
  minZoom: 15,
  /** 最大缩放级别 */
  maxZoom: 18,
  /** 默认起点坐标（兼容旧引用） */
  origin: DEFAULT_ORIGIN.point,
  /** 默认终点坐标（兼容旧引用） */
  destination: DEFAULT_DESTINATION.point,
} as const;

/** 默认 bbox 字符串（与 campus bounds 对齐） */
export const CAMPUS_DEFAULT_BBOX = `${CAMPUS.bounds.west},${CAMPUS.bounds.south},${CAMPUS.bounds.east},${CAMPUS.bounds.north}`;

/** 视口约束配置（供 MapSurface 使用） */
export interface ViewportConstraint {
  center: GeoPoint;
  bounds: { south: number; west: number; north: number; east: number };
  minZoom: number;
  maxZoom: number;
}

/** 导出视口约束对象 */
export const CAMPUS_VIEWPORT_CONSTRAINT: ViewportConstraint = {
  center: CAMPUS.center,
  bounds: CAMPUS.bounds,
  minZoom: CAMPUS.minZoom,
  maxZoom: CAMPUS.maxZoom,
};

/**
 * 离线 fallback 热力图数据。
 * 当后端不可用时，用这些校园点位附近的热力点保证地图不空白。
 */
export const OFFLINE_HEATMAP_CELLS: HeatmapCell[] = [
  {
    cellId: "offline-dorm",
    center: WAYPOINTS[0].point,
    score: 72,
    confidence: 0.6,
    count: 8,
    dominantTag: "CROWD",
  },
  {
    cellId: "offline-teaching1",
    center: WAYPOINTS[1].point,
    score: 65,
    confidence: 0.55,
    count: 12,
    dominantTag: "NOISE",
  },
  {
    cellId: "offline-library",
    center: WAYPOINTS[2].point,
    score: 28,
    confidence: 0.7,
    count: 5,
    dominantTag: "OTHER",
  },
  {
    cellId: "offline-canteen3",
    center: WAYPOINTS[3].point,
    score: 80,
    confidence: 0.65,
    count: 15,
    dominantTag: "CROWD",
  },
  {
    cellId: "offline-sports",
    center: WAYPOINTS[4].point,
    score: 45,
    confidence: 0.5,
    count: 6,
    dominantTag: "SUN",
  },
  {
    cellId: "offline-midpoint",
    center: { longitude: 120.2739, latitude: 31.4793 },
    score: 50,
    confidence: 0.45,
    count: 3,
    dominantTag: "NOISE",
  },
];
