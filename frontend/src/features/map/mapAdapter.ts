import type { GeoPoint } from "../../types";
import type {
  AMapInstanceLike,
  AMapLngLatLike,
  AMapNamespaceLike,
  AMapPointLike,
} from "./amapLoader";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  type MapViewport,
  type ProjectedPoint,
} from "./viewport";

export interface MapAdapter {
  destroy: () => void;
  getViewport: () => MapViewport;
  project: (point: GeoPoint) => ProjectedPoint;
  subscribe: (listener: () => void) => () => void;
}

function readCoordinate(
  point: AMapLngLatLike,
  method: "getLng" | "getLat",
  property: "lng" | "lat",
): number {
  const getter = point[method];
  if (getter) {
    return getter.call(point);
  }
  const value = point[property];
  if (typeof value !== "number") {
    throw new Error(`AMap point is missing ${property}.`);
  }
  return value;
}

function readPixel(point: AMapPointLike, axis: "x" | "y"): number {
  const getter = axis === "x" ? point.getX : point.getY;
  if (getter) {
    return getter.call(point);
  }
  const value = point[axis];
  if (typeof value !== "number") {
    throw new Error(`AMap projected point is missing ${axis}.`);
  }
  return value;
}

export function createAMapAdapter(
  container: HTMLElement,
  namespace: AMapNamespaceLike,
): MapAdapter {
  const map: AMapInstanceLike = new namespace.Map(container, {
    center: [DEFAULT_MAP_CENTER.longitude, DEFAULT_MAP_CENTER.latitude],
    resizeEnable: true,
    viewMode: "2D",
    zoom: DEFAULT_MAP_ZOOM,
  });
  const listeners = new Set<() => void>();
  let destroyed = false;

  const notify = () => {
    listeners.forEach((listener) => listener());
  };
  map.on("moveend", notify);
  map.on("zoomend", notify);

  const resizeObserver = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(() => {
      map.resize?.();
      notify();
    });
  resizeObserver?.observe(container);

  return {
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      resizeObserver?.disconnect();
      map.off("moveend", notify);
      map.off("zoomend", notify);
      listeners.clear();
      map.destroy();
    },
    getViewport: () => {
      const bounds = map.getBounds();
      const southWest = bounds.getSouthWest();
      const northEast = bounds.getNorthEast();
      const west = readCoordinate(southWest, "getLng", "lng");
      const south = readCoordinate(southWest, "getLat", "lat");
      const east = readCoordinate(northEast, "getLng", "lng");
      const north = readCoordinate(northEast, "getLat", "lat");
      return {
        bbox: [west, south, east, north]
          .map((value) => value.toFixed(6))
          .join(","),
        zoom: Math.round(map.getZoom()),
      };
    },
    project: (point) => {
      const projected = map.lngLatToContainer([
        point.longitude,
        point.latitude,
      ]);
      return {
        x: readPixel(projected, "x"),
        y: readPixel(projected, "y"),
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
