import type { GeoPoint } from "../types";

/** 江南大学蠡湖校区 — GCJ-02 坐标（高德坐标拾取工具核对） */
export const CAMPUS = {
  /** 校区中心（用于默认地图视口） */
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
  /** 学生公寓区（起点，以留学生公寓为定位锚点） */
  origin: { longitude: 120.2735103, latitude: 31.4753281 } as GeoPoint,
  /** 第一教学楼（终点） */
  destination: { longitude: 120.2743195, latitude: 31.4832753 } as GeoPoint,
} as const;

/** 5 个校园地标点位（GCJ-02 坐标） */
export const CAMPUS_POINTS = [
  { id: "dorm",    name: "学生公寓区", point: { longitude: 120.2735103, latitude: 31.4753281 } as GeoPoint },
  { id: "teach1",  name: "第一教学楼", point: { longitude: 120.2743195, latitude: 31.4832753 } as GeoPoint },
  { id: "library", name: "图书馆",     point: { longitude: 120.2740,    latitude: 31.4795 } as GeoPoint },
  { id: "canteen", name: "三食堂",     point: { longitude: 120.2725,    latitude: 31.4770 } as GeoPoint },
  { id: "sports",  name: "体育中心",   point: { longitude: 120.2760,    latitude: 31.4810 } as GeoPoint },
] as const;

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
