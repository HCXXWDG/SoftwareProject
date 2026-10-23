import type { GeoPoint } from "../../types";
import { SERVICE_AREA } from "../../config/serviceArea";

export const DEFAULT_MAP_CENTER: GeoPoint = SERVICE_AREA.center;
export const DEFAULT_MAP_ZOOM: number = SERVICE_AREA.defaultZoom;

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

/** One scale for real feedback, simulated cells, detail dots and the legend. */
export const STRESS_COLOR_STOPS = [
  { score: 0, rgb: [37, 99, 235] },
  { score: 25, rgb: [6, 182, 212] },
  { score: 50, rgb: [250, 204, 21] },
  { score: 75, rgb: [249, 115, 22] },
  { score: 100, rgb: [220, 38, 38] },
] as const;

export function scoreToColor(score: number): string {
  const bounded = Math.max(0, Math.min(100, score));
  const index = Math.min(Math.floor(bounded / 25), STRESS_COLOR_STOPS.length - 2);
  const from = STRESS_COLOR_STOPS[index];
  const to = STRESS_COLOR_STOPS[index + 1];
  const ratio = (bounded - from.score) / (to.score - from.score);
  const rgb = from.rgb.map((value, channel) => Math.round(value + (to.rgb[channel] - value) * ratio));
  return `rgb(${rgb.join(", ")})`;
}

export const STRESS_COLOR_GRADIENT = `linear-gradient(90deg, ${STRESS_COLOR_STOPS.map(({ score }) => `${scoreToColor(score)} ${score}%`).join(", ")})`;

export function scoreToGradient(score: number): { inner: string; outer: string } {
  const color = scoreToColor(score);
  return {
    inner: color,
    outer: color.replace("rgb(", "rgba(").replace(")", ", 0)"),
  };
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
