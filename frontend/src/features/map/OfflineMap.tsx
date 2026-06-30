import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  type WheelEvent,
} from "react";
import type { GeoPoint } from "../../types";
import {
  calculateViewport,
  clampCenterToBounds,
  clampZoom,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  getMapSize,
  panCenter,
  projectGeoPoint,
  unprojectGeoPoint,
  type MapViewport,
  type MapViewportConstraint,
  type ProjectedPoint,
} from "./viewport";

const MIN_ZOOM = 11;
const MAX_ZOOM = 18;
const KEYBOARD_PAN_PIXELS = 80;

interface OfflineMapProps {
  containerRef: RefObject<HTMLDivElement | null>;
  onProjectorChange: (
    project: (point: GeoPoint) => ProjectedPoint,
    unproject: (point: ProjectedPoint) => GeoPoint,
    viewport: MapViewport,
    commitViewport: boolean,
  ) => void;
  viewportConstraint?: MapViewportConstraint;
}

interface DragState {
  center: GeoPoint;
  pointerId: number;
  startX: number;
  startY: number;
}

export function OfflineMap({
  containerRef,
  onProjectorChange,
  viewportConstraint,
}: OfflineMapProps) {
  const [center, setCenter] = useState(
    viewportConstraint?.center ?? DEFAULT_MAP_CENTER,
  );
  const [zoom, setZoom] = useState(
    viewportConstraint
      ? clampZoom(
          viewportConstraint.defaultZoom ?? DEFAULT_MAP_ZOOM,
          viewportConstraint.minZoom,
          viewportConstraint.maxZoom,
        )
      : DEFAULT_MAP_ZOOM,
  );
  const dragRef = useRef<DragState | null>(null);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const commitViewportRef = useRef(true);
  centerRef.current = center;
  zoomRef.current = zoom;

  const effectiveMinZoom = viewportConstraint?.minZoom ?? MIN_ZOOM;
  const effectiveMaxZoom = viewportConstraint?.maxZoom ?? MAX_ZOOM;

  const clampPanCenter = useCallback(
    (next: GeoPoint): GeoPoint =>
      viewportConstraint
        ? clampCenterToBounds(next, viewportConstraint.bounds)
        : next,
    [viewportConstraint],
  );

  const publishViewport = useCallback((commitViewport = commitViewportRef.current) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const currentCenter = clampPanCenter(centerRef.current);
    const currentZoom = clampZoom(zoomRef.current, effectiveMinZoom, effectiveMaxZoom);
    const size = getMapSize(container);
    onProjectorChange(
      (point) => projectGeoPoint(point, currentCenter, currentZoom, size),
      (point) => unprojectGeoPoint(point, currentCenter, currentZoom, size),
      calculateViewport(currentCenter, currentZoom, size),
      commitViewport,
    );
  }, [containerRef, onProjectorChange, clampPanCenter, effectiveMinZoom, effectiveMaxZoom]);

  useEffect(() => {
    publishViewport();
  }, [center, publishViewport, zoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => publishViewport());
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, publishViewport]);

  const changeZoom = (delta: number) => {
    commitViewportRef.current = true;
    setZoom((current) =>
      clampZoom(current + delta, effectiveMinZoom, effectiveMaxZoom),
    );
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      center,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    commitViewportRef.current = false;
    setCenter(
      clampPanCenter(
        panCenter(
          drag.center,
          zoom,
          event.clientX - drag.startX,
          event.clientY - drag.startY,
        ),
      ),
    );
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      commitViewportRef.current = true;
      publishViewport(true);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 1 : -1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const movement: Record<string, [number, number]> = {
      ArrowDown: [0, -KEYBOARD_PAN_PIXELS],
      ArrowLeft: [KEYBOARD_PAN_PIXELS, 0],
      ArrowRight: [-KEYBOARD_PAN_PIXELS, 0],
      ArrowUp: [0, KEYBOARD_PAN_PIXELS],
    };

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      changeZoom(1);
      return;
    }
    if (event.key === "-") {
      event.preventDefault();
      changeZoom(-1);
      return;
    }

    const delta = movement[event.key];
    if (delta) {
      event.preventDefault();
      commitViewportRef.current = true;
      setCenter((current) =>
        clampPanCenter(panCenter(current, zoom, delta[0], delta[1])),
      );
    }
  };

  return (
    <div
      aria-label="离线演示地图，可拖动并使用方向键或加减键缩放"
      className="map-surface__offline-map"
      data-testid="offline-map"
      onKeyDown={handleKeyDown}
      onPointerCancel={stopDragging}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onWheel={handleWheel}
      role="application"
      tabIndex={0}
    >
      <div className="map-surface__offline-grid" />
      <div className="map-surface__offline-road map-surface__offline-road--one" />
      <div className="map-surface__offline-road map-surface__offline-road--two" />
      <div className="map-surface__offline-road map-surface__offline-road--three" />
      <span className="map-surface__offline-place map-surface__offline-place--one">
        学生公寓区
      </span>
      <span className="map-surface__offline-place map-surface__offline-place--two">
        第一教学楼
      </span>

      <div aria-label="地图缩放" className="map-surface__zoom-controls">
        <button aria-label="放大地图" onClick={() => changeZoom(1)} type="button">
          +
        </button>
        <span aria-label={`缩放级别 ${zoom}`}>{zoom}</span>
        <button aria-label="缩小地图" onClick={() => changeZoom(-1)} type="button">
          -
        </button>
      </div>
    </div>
  );
}
