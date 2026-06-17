import type { GeoPoint } from "../../types";
import { CAMPUS } from "../../config/campus";
import { clampCenter } from "./boundsClamp";
import type {
  AMapInstanceLike,
  AMapLngLatLike,
  AMapNamespaceLike,
  AMapPointLike,
} from "./amapLoader";
import {
  type MapViewport,
  type ProjectedPoint,
} from "./viewport";

export interface MapAdapter {
  destroy: () => void;
  getViewport: () => MapViewport;
  project: (point: GeoPoint) => ProjectedPoint;
  unproject: (point: ProjectedPoint) => GeoPoint;
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
  /** 构建校园边界约束对象 */
  const campusBounds = new namespace.Bounds(
    [CAMPUS.bounds.west, CAMPUS.bounds.south],
    [CAMPUS.bounds.east, CAMPUS.bounds.north],
  );

  const map: AMapInstanceLike = new namespace.Map(container, {
    center: [CAMPUS.center.longitude, CAMPUS.center.latitude],
    resizeEnable: true,
    viewMode: "2D",
    zoom: CAMPUS.minZoom + 1,
    minZoom: CAMPUS.minZoom,
    maxZoom: CAMPUS.maxZoom,
    limitBounds: campusBounds,
  });
  const listeners = new Set<() => void>();
  let destroyed = false;

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  /** moveend 时检查中心，超出校园边界则自动回弹 */
  const handleMoveEnd = () => {
    const center = map.getCenter();
    const lng = readCoordinate(center, "getLng", "lng");
    const lat = readCoordinate(center, "getLat", "lat");
    const clamped = clampCenter({ longitude: lng, latitude: lat });
    if (clamped.longitude !== lng || clamped.latitude !== lat) {
      map.setCenter([clamped.longitude, clamped.latitude]);
    }
    notify();
  };

  map.on("moveend", handleMoveEnd);
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
      map.off("moveend", handleMoveEnd);
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
