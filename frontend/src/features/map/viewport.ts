import type { GeoPoint } from "../../types";

export const DEFAULT_MAP_CENTER: GeoPoint = {
  longitude: 120.273915,
  latitude: 31.479302,
};
export const DEFAULT_MAP_ZOOM = 16;

const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878;
const FALLBACK_WIDTH = 960;
const FALLBACK_HEIGHT = 600;

export interface MapViewport {
  bbox: string;
  zoom: number;
}

export interface MapSize {
  width: number;
  height: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface GeoBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface MapViewportConstraint {
  center: GeoPoint;
  bounds: GeoBounds;
  minZoom: number;
  maxZoom: number;
  defaultZoom?: number;
}

function clampLatitude(latitude: number): number {
  return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
}

export function clampZoom(zoom: number, minZoom: number, maxZoom: number): number {
  return Math.max(minZoom, Math.min(maxZoom, Math.round(zoom)));
}

export function clampCenterToBounds(
  center: GeoPoint,
  bounds: GeoBounds,
): GeoPoint {
  return {
    longitude: Math.max(
      bounds.west,
      Math.min(bounds.east, center.longitude),
    ),
    latitude: Math.max(
      bounds.south,
      Math.min(bounds.north, center.latitude),
    ),
  };
}

export function isPointInBounds(point: GeoPoint, bounds: GeoBounds): boolean {
  return (
    point.longitude >= bounds.west &&
    point.longitude <= bounds.east &&
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north
  );
}

function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

function longitudeToWorldX(longitude: number, zoom: number): number {
  return ((longitude + 180) / 360) * worldSize(zoom);
}

function latitudeToWorldY(latitude: number, zoom: number): number {
  const radians = (clampLatitude(latitude) * Math.PI) / 180;
  const mercator = Math.log(Math.tan(Math.PI / 4 + radians / 2));
  return (0.5 - mercator / (2 * Math.PI)) * worldSize(zoom);
}

function worldXToLongitude(x: number, zoom: number): number {
  return (x / worldSize(zoom)) * 360 - 180;
}

function worldYToLatitude(y: number, zoom: number): number {
  const mercator = Math.PI - (2 * Math.PI * y) / worldSize(zoom);
  return (180 / Math.PI) * Math.atan(Math.sinh(mercator));
}

export function getMapSize(element: HTMLElement): MapSize {
  const rect = element.getBoundingClientRect();
  return {
    width: rect.width || element.clientWidth || FALLBACK_WIDTH,
    height: rect.height || element.clientHeight || FALLBACK_HEIGHT,
  };
}

export function projectGeoPoint(
  point: GeoPoint,
  center: GeoPoint,
  zoom: number,
  size: MapSize,
): ProjectedPoint {
  const centerX = longitudeToWorldX(center.longitude, zoom);
  const centerY = latitudeToWorldY(center.latitude, zoom);
  return {
    x: size.width / 2 + longitudeToWorldX(point.longitude, zoom) - centerX,
    y: size.height / 2 + latitudeToWorldY(point.latitude, zoom) - centerY,
  };
}

export function panCenter(
  startCenter: GeoPoint,
  zoom: number,
  deltaX: number,
  deltaY: number,
): GeoPoint {
  const centerX = longitudeToWorldX(startCenter.longitude, zoom) - deltaX;
  const centerY = latitudeToWorldY(startCenter.latitude, zoom) - deltaY;
  return {
    longitude: worldXToLongitude(centerX, zoom),
    latitude: worldYToLatitude(centerY, zoom),
  };
}

export function calculateViewport(
  center: GeoPoint,
  zoom: number,
  size: MapSize,
): MapViewport {
  const centerX = longitudeToWorldX(center.longitude, zoom);
  const centerY = latitudeToWorldY(center.latitude, zoom);
  const west = worldXToLongitude(centerX - size.width / 2, zoom);
  const east = worldXToLongitude(centerX + size.width / 2, zoom);
  const north = worldYToLatitude(centerY - size.height / 2, zoom);
  const south = worldYToLatitude(centerY + size.height / 2, zoom);

  return {
    bbox: [west, south, east, north].map((value) => value.toFixed(6)).join(","),
    zoom: Math.round(zoom),
  };
}

export function scoreToColor(score: number): string {
  const ratio = Math.max(0, Math.min(100, score)) / 100;
  const start = { red: 35, green: 104, blue: 255 };
  const end = { red: 239, green: 68, blue: 68 };
  const mix = (from: number, to: number) => Math.round(from + (to - from) * ratio);
  return `rgb(${mix(start.red, end.red)}, ${mix(start.green, end.green)}, ${mix(start.blue, end.blue)})`;
}

export function unprojectGeoPoint(
  point: ProjectedPoint,
  center: GeoPoint,
  zoom: number,
  size: MapSize,
): GeoPoint {
  const centerX = longitudeToWorldX(center.longitude, zoom);
  const centerY = latitudeToWorldY(center.latitude, zoom);
  const worldX = point.x - size.width / 2 + centerX;
  const worldY = point.y - size.height / 2 + centerY;
  return {
    longitude: worldXToLongitude(worldX, zoom),
    latitude: worldYToLatitude(worldY, zoom),
  };
}

export function confidenceToOpacity(confidence: number): number {
  return Math.max(0.18, Math.min(1, confidence));
}
