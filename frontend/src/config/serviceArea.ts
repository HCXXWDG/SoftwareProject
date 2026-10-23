import type { GeoPoint } from "../types";

export const PRODUCT_NAME = "心途——通勤情绪地图";
export interface Waypoint { id: string; name: string; point: GeoPoint }

/** GCJ-02: AMap place search, verified district name 梁溪区 on 2026-10-23. */
export const WAYPOINTS: Waypoint[] = [
  { id: "nanchansi", name: "南禅寺", point: { longitude: 120.308640, latitude: 31.566744 } },
  { id: "chongansi", name: "崇安寺", point: { longitude: 120.301784, latitude: 31.578312 } },
  { id: "station", name: "无锡站", point: { longitude: 120.306343, latitude: 31.588016 } },
  { id: "donglin", name: "东林书院", point: { longitude: 120.308567, latitude: 31.576862 } },
  { id: "canal", name: "清名桥", point: { longitude: 120.318564, latitude: 31.557328 } },
];
export const DEFAULT_ORIGIN = WAYPOINTS[0];
export const DEFAULT_DESTINATION = WAYPOINTS[1];
export function findWaypoint(id: string): Waypoint | undefined { return WAYPOINTS.find(point => point.id === id); }

/**
 * Liangxi district overview (GCJ-02). The viewport uses the bounding rectangle of
 * AMap's district 320213 polygon; it is not an exact administrative geofence.
 * Source: https://lbs.amap.com/api/webservice/guide/api/district/ (2026-10-23).
 */
export const SERVICE_AREA = {
  id: "320213", name: "梁溪区", city: "无锡", coordinateSystem: "GCJ-02",
  center: { longitude: 120.296591, latitude: 31.571878 } as GeoPoint,
  bounds: { west: 120.240331, east: 120.352851, south: 31.512825, north: 31.630931 },
  minZoom: 11, maxZoom: 19, defaultZoom: 12, pickerZoom: 16,
  origin: DEFAULT_ORIGIN.point, destination: DEFAULT_DESTINATION.point,
} as const;
export const SERVICE_DEFAULT_BBOX = `${SERVICE_AREA.bounds.west},${SERVICE_AREA.bounds.south},${SERVICE_AREA.bounds.east},${SERVICE_AREA.bounds.north}`;
export interface ViewportConstraint {
  center: GeoPoint;
  bounds: { south: number; west: number; north: number; east: number };
  minZoom: number; maxZoom: number; defaultZoom?: number;
}
export const SERVICE_VIEWPORT_CONSTRAINT: ViewportConstraint = {
  center: SERVICE_AREA.center, bounds: SERVICE_AREA.bounds,
  minZoom: SERVICE_AREA.minZoom, maxZoom: SERVICE_AREA.maxZoom, defaultZoom: SERVICE_AREA.defaultZoom,
};
export function isPointInServiceArea(point: GeoPoint): boolean {
  return Number.isFinite(point.longitude) && Number.isFinite(point.latitude)
    && point.longitude >= SERVICE_AREA.bounds.west && point.longitude <= SERVICE_AREA.bounds.east
    && point.latitude >= SERVICE_AREA.bounds.south && point.latitude <= SERVICE_AREA.bounds.north;
}
