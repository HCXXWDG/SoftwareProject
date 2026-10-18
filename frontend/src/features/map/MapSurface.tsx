import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  EmotionTag,
  GeoPoint,
  HeatmapCell,
  MapFeedbackDraft,
  ScoredRoute,
} from "../../types";
import { EmojiFountain } from "./EmojiFountain";
import { EndpointMarkers } from "./EndpointMarkers";
import { FeedbackPanel } from "./FeedbackPanel";
import { HeatmapOverlay } from "./HeatmapOverlay";
import { RouteLegend } from "./RouteLegend";
import { RouteOverlay } from "./RouteOverlay";
import { loadAMap } from "./amapLoader";
import { createAMapAdapter, type MapAdapter } from "./mapAdapter";
import { OfflineMap } from "./OfflineMap";
import { useLongPress, type LongPressPosition } from "./useLongPress";
import {
  isPointInBounds,
  type MapViewport,
  type MapViewportConstraint,
  type ProjectedPoint,
} from "./viewport";
import "./MapSurface.css";

export interface MapSurfaceProps {
  heatmapCells: HeatmapCell[];
  routes: ScoredRoute[];
  selectedRouteId?: string;
  loading: boolean;
  onFeedbackSubmit: (draft: MapFeedbackDraft) => Promise<void | { status: "created" | "duplicate" }>;
  onRouteSelect: (routeId: string) => void;
  onViewportChange: (bbox: string, zoom: number) => void;
  origin?: GeoPoint;
  destination?: GeoPoint;
  viewportConstraint?: MapViewportConstraint;
  /** A 统一派生操作能力；不以底图模式推断后端状态。 */
  feedbackEnabled?: boolean;
  onModeChange?: (mode: MapMode) => void;
}

type MapMode = "loading" | "amap" | "offline";

const unavailableProjector = (): ProjectedPoint => ({ x: -1_000, y: -1_000 });
const unavailableUnprojector = (): GeoPoint => ({ longitude: 0, latitude: 0 });

export function MapSurface({
  heatmapCells,
  routes,
  selectedRouteId,
  loading,
  onFeedbackSubmit,
  onRouteSelect,
  onViewportChange,
  origin,
  destination,
  viewportConstraint,
  feedbackEnabled = true,
  onModeChange,
}: MapSurfaceProps) {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<MapAdapter | null>(null);
  const viewportCallbackRef = useRef(onViewportChange);
  const feedbackSubmitRef = useRef(onFeedbackSubmit);
  feedbackSubmitRef.current = onFeedbackSubmit;

  const [mode, setMode] = useState<MapMode>("loading");
  useEffect(() => { onModeChange?.(mode); }, [mode, onModeChange]);
  const [projector, setProjector] = useState<
    (point: GeoPoint) => ProjectedPoint
  >(() => unavailableProjector);
  const [unprojector, setUnprojector] = useState<
    (point: ProjectedPoint) => GeoPoint
  >(() => unavailableUnprojector);
  const [viewportRevision, setViewportRevision] = useState(0);

  // Feedback panel state
  const [feedbackPosition, setFeedbackPosition] =
    useState<LongPressPosition | null>(null);
  const [feedbackGeoPoint, setFeedbackGeoPoint] = useState<GeoPoint | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Emoji fountain state
  const [fountainPosition, setFountainPosition] =
    useState<LongPressPosition | null>(null);
  const [fountainEmoji, setFountainEmoji] = useState<string | null>(null);

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
        const adapter = createAMapAdapter(container, namespace, {
          viewportConstraint,
        });
        adapterRef.current = adapter;
        setProjector(() => (point: GeoPoint) => adapter.project(point));
        setUnprojector(
          () => (point: ProjectedPoint) => adapter.unproject(point),
        );
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
  }, [publishAdapterViewport, viewportConstraint]);

  const handleOfflineProjectorChange = useCallback(
    (
      nextProjector: (point: GeoPoint) => ProjectedPoint,
      nextUnprojector: (point: ProjectedPoint) => GeoPoint,
      viewport: MapViewport,
      commitViewport: boolean,
    ) => {
      setProjector(() => nextProjector);
      setUnprojector(() => nextUnprojector);
      setViewportRevision((current) => current + 1);
      if (commitViewport) {
        viewportCallbackRef.current(viewport.bbox, viewport.zoom);
      }
    },
    [],
  );

  // Long-press handler: screen position -> GeoPoint -> show feedback panel
  // 校园外长按不弹出反馈面板
  const handleLongPress = useCallback(
    (position: LongPressPosition) => {
      if (!feedbackEnabled || submitting || feedbackPosition) return;
      const container = mapHostRef.current;
      if (!container) {
        return;
      }
      // Convert screen coords to container-relative coords
      const rect = container.getBoundingClientRect();
      const relativePoint: ProjectedPoint = {
        x: position.x - rect.left,
        y: position.y - rect.top,
      };
      const geoPoint = unprojector(relativePoint);
      // Reject long-press feedback coordinates outside the campus bounds
      if (viewportConstraint && !isPointInBounds(geoPoint, viewportConstraint.bounds)) {
        return;
      }

      setFeedbackGeoPoint(geoPoint);
      setFeedbackError(null);
      setFeedbackPosition(relativePoint);
    },
    [unprojector, viewportConstraint, feedbackEnabled, submitting, feedbackPosition],
  );

  const {
    longPressPosition: _lpPos,
    clearLongPress,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useLongPress(handleLongPress);

  const handleFeedbackSubmit = useCallback(
    async (stressLevel: number, tag: EmotionTag) => {
      if (!feedbackGeoPoint || !feedbackPosition || !feedbackEnabled) {
        return;
      }
      setSubmitting(true);
      setFeedbackError(null);
      try {
        const result = await feedbackSubmitRef.current({
          location: feedbackGeoPoint,
          stressLevel: stressLevel as MapFeedbackDraft["stressLevel"],
          tag,
        });
        // Show emoji fountain on success
        const emojiMap: Record<number, string> = {
          0: "😊",
          25: "🙂",
          50: "😐",
          75: "😟",
          100: "😫",
        };
        if (result?.status !== "duplicate") {
          setFountainPosition(feedbackPosition);
          setFountainEmoji(emojiMap[stressLevel] ?? "✨");
        }
        setFeedbackPosition(null);
        setFeedbackGeoPoint(null);
        clearLongPress();
      } catch (error) {
        setFeedbackError(error instanceof Error ? error.message : "反馈提交失败，请稍后重试。");
      } finally {
        setSubmitting(false);
      }
    },
    [feedbackGeoPoint, feedbackPosition, clearLongPress, feedbackEnabled],
  );

  const handleFeedbackCancel = useCallback(() => {
    setFeedbackPosition(null);
    setFeedbackGeoPoint(null);
    setSubmitting(false);
    setFeedbackError(null);
    clearLongPress();
  }, [clearLongPress]);

  const handleFountainComplete = useCallback(() => {
    setFountainPosition(null);
    setFountainEmoji(null);
  }, []);

  return (
    <section
      aria-label="校园通勤情绪地图"
      className="map-surface"
      data-map-mode={mode}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
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
          viewportConstraint={viewportConstraint}
        />
      )}

      {mode !== "loading" && (origin || destination) && (
        <EndpointMarkers
          origin={origin}
          destination={destination}
          project={projector}
          viewportRevision={viewportRevision}
        />
      )}

      {mode !== "loading" && (
        <HeatmapOverlay
          cells={heatmapCells}
          project={(cell) => projector(cell.center)}
          viewportRevision={viewportRevision}
        />
      )}

      {mode !== "loading" && routes.length > 0 && (
        <RouteOverlay
          project={(point) => projector(point)}
          routes={routes}
          selectedRouteId={selectedRouteId}
          viewportRevision={viewportRevision}
          onRouteSelect={onRouteSelect}
        />
      )}

      {feedbackPosition && (
        <FeedbackPanel
          position={feedbackPosition}
          submitting={submitting}
          submissionEnabled={feedbackEnabled}
          onCancel={handleFeedbackCancel}
          onSubmit={handleFeedbackSubmit}
        />
      )}
      {feedbackPosition && feedbackError && <p className="map-surface__feedback-error" role="alert">{feedbackError}</p>}

      {fountainPosition && fountainEmoji && (
        <EmojiFountain
          emoji={fountainEmoji}
          position={fountainPosition}
          onComplete={handleFountainComplete}
        />
      )}

      {routes.length > 0 && (
        <RouteLegend routes={routes} selectedRouteId={selectedRouteId} />
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
