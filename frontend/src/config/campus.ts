import type { GeoPoint } from "../types";

/** 江南大学蠡湖校区 — GCJ-02 近似坐标 */
export const CAMPUS = {
  /** 校区中心（用于默认地图视口） */
  center: { longitude: 120.338, latitude: 31.488 } as GeoPoint,
  /** 可视域边界（蠡湖校区边界外扩约 200 米） */
  bounds: {
    south: 31.478,
    west: 120.324,
    north: 31.498,
    east: 120.352,
  },
  /** 最小缩放级别 */
  minZoom: 15,
  /** 最大缩放级别 */
  maxZoom: 18,
  /** 学生公寓区（起点，以留学生公寓为定位锚点） */
  origin: { longitude: 120.3345, latitude: 31.492 } as GeoPoint,
  /** 第一教学楼（终点） */
  destination: { longitude: 120.3415, latitude: 31.4845 } as GeoPoint,
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
