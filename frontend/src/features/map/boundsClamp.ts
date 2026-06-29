import type { GeoPoint } from "../../types";
import { CAMPUS } from "../../config/campus";

/** 边界矩形 */
export interface LatLngBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * 将中心点限制在校园边界内。
 * 超出范围时 clamp 到最近的合法位置。
 */
export function clampCenter(
  center: GeoPoint,
  bounds: LatLngBounds = CAMPUS.bounds,
): GeoPoint {
  return {
    longitude: Math.max(bounds.west, Math.min(bounds.east, center.longitude)),
    latitude: Math.max(bounds.south, Math.min(bounds.north, center.latitude)),
  };
}

/**
 * 限制缩放级别在 [min, max] 范围内。
 */
export function clampZoom(
  zoom: number,
  min: number = CAMPUS.minZoom,
  max: number = CAMPUS.maxZoom,
): number {
  return Math.max(min, Math.min(max, zoom));
}

/**
 * 判断坐标点是否位于边界内。
 * 用于长按反馈校验：校园外长按不弹出反馈面板。
 */
export function isInsideBounds(
  point: GeoPoint,
  bounds: LatLngBounds = CAMPUS.bounds,
): boolean {
  return (
    point.longitude >= bounds.west &&
    point.longitude <= bounds.east &&
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north
  );
}
