import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { GeoPoint, HeatmapCell } from "../../types";
import { HeatmapOverlay } from "./HeatmapOverlay";
import { loadAMap } from "./amapLoader";
import { createAMapAdapter, type MapAdapter } from "./mapAdapter";
import { OfflineMap } from "./OfflineMap";
import type { MapViewport, ProjectedPoint } from "./viewport";
import "./MapSurface.css";

export interface MapSurfaceProps {
  heatmapCells: HeatmapCell[];
  loading: boolean;
  onViewportChange: (bbox: string, zoom: number) => void;
}

type MapMode = "loading" | "amap" | "offline";

const unavailableProjector = (): ProjectedPoint => ({ x: -1_000, y: -1_000 });

export function MapSurface({
  heatmapCells,
  loading,
  onViewportChange,
}: MapSurfaceProps) {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<MapAdapter | null>(null);
  const viewportCallbackRef = useRef(onViewportChange);
  const [mode, setMode] = useState<MapMode>("loading");
  const [projector, setProjector] = useState<(
    point: GeoPoint,
  ) => ProjectedPoint>(() => unavailableProjector);
  const [viewportRevision, setViewportRevision] = useState(0);

  useEffect(() => {
    viewportCallbackRef.current = onViewportChange;
  }, [onViewportChange]);

  const publishAdapterViewport = useCallback((adapter: MapAdapter) => {
    const viewport = adapter.getViewport();
    viewportCallbackRef.current(viewport.bbox, viewport.zoom);
    setViewportRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    const container = mapHostRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    const key = import.meta.env.VITE_AMAP_JS_KEY?.trim() ?? "";
    const securityCode = import.meta.env.VITE_AMAP_SECURITY_CODE?.trim() ?? "";

    const useOfflineMap = () => {
      if (!cancelled) {
        setMode("offline");
      }
    };

    if (!key) {
      useOfflineMap();
      return;
    }

    loadAMap({ key, securityCode })
      .then((namespace) => {
        if (cancelled) {
          return;
        }
        const adapter = createAMapAdapter(container, namespace);
        adapterRef.current = adapter;
        setProjector(() => (point: GeoPoint) => adapter.project(point));
        unsubscribe = adapter.subscribe(() => publishAdapterViewport(adapter));
        setMode("amap");
        publishAdapterViewport(adapter);
      })
      .catch(useOfflineMap);

    return () => {
      cancelled = true;
      unsubscribe?.();
      adapterRef.current?.destroy();
      adapterRef.current = null;
    };
  }, [publishAdapterViewport]);

  const handleOfflineProjectorChange = useCallback(
    (
      nextProjector: (point: GeoPoint) => ProjectedPoint,
      viewport: MapViewport,
      commitViewport: boolean,
    ) => {
      setProjector(() => nextProjector);
      setViewportRevision((current) => current + 1);
      if (commitViewport) {
        viewportCallbackRef.current(viewport.bbox, viewport.zoom);
      }
    },
    [],
  );

  return (
    <section
      aria-label="城市通勤情绪地图"
      className="map-surface"
      data-map-mode={mode}
    >
      <div
        className="map-surface__canvas"
        data-testid="map-canvas"
        ref={mapHostRef}
      />

      {mode === "offline" && (
        <OfflineMap
          containerRef={mapHostRef}
          onProjectorChange={handleOfflineProjectorChange}
        />
      )}

      {mode !== "loading" && (
        <HeatmapOverlay
          cells={heatmapCells}
          project={(cell) => projector(cell.center)}
          viewportRevision={viewportRevision}
        />
      )}

      <div className="map-surface__mode-badge" role="status">
        {mode === "loading" && "正在加载地图"}
        {mode === "amap" && "高德地图"}
        {mode === "offline" && "离线演示地图"}
      </div>

      {loading && (
        <div aria-live="polite" className="map-surface__loading" role="status">
          正在更新情绪热力图
        </div>
      )}
    </section>
  );
}
