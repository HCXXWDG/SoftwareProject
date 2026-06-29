import type { GeoPoint } from "../../types";
import type {
  AMapInstanceLike,
  AMapLngLatLike,
  AMapNamespaceLike,
  AMapPointLike,
} from "./amapLoader";
import {
  clampZoom,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  type MapViewport,
  type MapViewportConstraint,
  type ProjectedPoint,
} from "./viewport";

export interface MapAdapter {
  destroy: () => void;
  getViewport: () => MapViewport;
  project: (point: GeoPoint) => ProjectedPoint;
  unproject: (point: ProjectedPoint) => GeoPoint;
  subscribe: (listener: () => void) => () => void;
}

export interface CreateAMapAdapterOptions {
  viewportConstraint?: MapViewportConstraint;
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
  options: CreateAMapAdapterOptions = {},
): MapAdapter {
  const { viewportConstraint } = options;
  const initialCenter = viewportConstraint?.center ?? DEFAULT_MAP_CENTER;
  const initialZoom = viewportConstraint
    ? clampZoom(
        viewportConstraint.defaultZoom ?? DEFAULT_MAP_ZOOM,
        viewportConstraint.minZoom,
        viewportConstraint.maxZoom,
      )
    : DEFAULT_MAP_ZOOM;
  const map: AMapInstanceLike = new namespace.Map(container, {
    center: [initialCenter.longitude, initialCenter.latitude],
    resizeEnable: true,
    viewMode: "2D",
    zoom: initialZoom,
    ...(viewportConstraint
      ? {
          zooms: [viewportConstraint.minZoom, viewportConstraint.maxZoom],
          // limitBounds: [sw.lng, sw.lat, ne.lng, ne.lat]
          limitBounds: [
            viewportConstraint.bounds.west,
            viewportConstraint.bounds.south,
            viewportConstraint.bounds.east,
            viewportConstraint.bounds.north,
          ],
        }
      : {}),
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
    unproject: (point) => {
      const lngLat = map.containerToLngLat([point.x, point.y]);
      return {
        longitude: readCoordinate(lngLat, "getLng", "lng"),
        latitude: readCoordinate(lngLat, "getLat", "lat"),
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
