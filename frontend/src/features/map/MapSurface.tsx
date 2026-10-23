import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  getMapSize,
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
  onFeedbackOpen?: () => void;
  pointSelection?: { label: string; onSelect: (point: GeoPoint) => void };
  heatmapLabel?: string;
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
  onFeedbackOpen,
  pointSelection,
  heatmapLabel,
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
  const [feedbackDuplicate, setFeedbackDuplicate] = useState(false);
  const feedbackOpenRef = useRef(false);
  const feedbackInFlightRef = useRef(false);
  const recordHereRef = useRef<HTMLButtonElement>(null);
  const feedbackReturnFocusRef = useRef<HTMLElement | null>(null);
  const feedbackLayerRef = useRef<HTMLDivElement>(null);
  const [panelPosition, setPanelPosition] = useState<ProjectedPoint | null>(null);

  useEffect(() => {
    if (feedbackPosition || !feedbackReturnFocusRef.current) return;
    const previous = feedbackReturnFocusRef.current;
    feedbackReturnFocusRef.current = null;
    if (previous.isConnected && !previous.matches(":disabled")) previous.focus();
    else if (recordHereRef.current && !recordHereRef.current.disabled) recordHereRef.current.focus();
    else mapHostRef.current?.focus();
  }, [feedbackPosition]);

  useLayoutEffect(() => {
    if (!feedbackPosition) return;
    const container = mapHostRef.current;
    const panel = feedbackLayerRef.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (!container || !panel) return;
    const placePanel = () => {
      const size = getMapSize(container);
      const measured = panel.getBoundingClientRect();
      if (measured.width <= 0 || measured.height <= 0) return;
      const x = Math.min(Math.max(8, feedbackPosition.x + 12), Math.max(8, size.width - measured.width - 8));
      const above = feedbackPosition.y - measured.height - 12;
      const y = Math.min(Math.max(8, above >= 8 ? above : feedbackPosition.y + 12),
        Math.max(8, size.height - measured.height - 8));
      setPanelPosition(current => current?.x === x && current.y === y ? current : { x, y });
    };
    placePanel();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(placePanel);
    observer?.observe(container);
    observer?.observe(panel);
    window.addEventListener("resize", placePanel);
    return () => { observer?.disconnect(); window.removeEventListener("resize", placePanel); };
  }, [feedbackPosition, feedbackError, feedbackDuplicate]);

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

  const openFeedback = useCallback(
    (relativePoint: ProjectedPoint) => {
      if (!feedbackEnabled || feedbackOpenRef.current || feedbackInFlightRef.current
        || mode === "loading" || unprojector === unavailableUnprojector) return;
      const geoPoint = unprojector(relativePoint);
      if (!Number.isFinite(geoPoint.longitude) || !Number.isFinite(geoPoint.latitude)
        || Math.abs(geoPoint.longitude) > 180 || Math.abs(geoPoint.latitude) > 90) return;
      if (viewportConstraint && !isPointInBounds(geoPoint, viewportConstraint.bounds)) {
        return;
      }
      feedbackOpenRef.current = true;
      // Capture before the same render disables the entry button and the browser blurs it.
      feedbackReturnFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement : recordHereRef.current;
      onFeedbackOpen?.();
      setFeedbackGeoPoint(geoPoint);
      setFeedbackError(null);
      setFeedbackDuplicate(false);
      setPanelPosition(null);
      setFeedbackPosition(relativePoint);
    },
    [unprojector, viewportConstraint, feedbackEnabled, mode, onFeedbackOpen],
  );

  const handleLongPress = useCallback((position: LongPressPosition) => {
    const container = mapHostRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    openFeedback({ x: position.x - rect.left, y: position.y - rect.top });
  }, [openFeedback]);

  const handleRecordHere = () => {
    const container = mapHostRef.current;
    if (!container) return;
    const size = getMapSize(container);
    openFeedback({ x: size.width / 2, y: size.height / 2 });
  };

  const handleSelectCenter = () => {
    const container = mapHostRef.current;
    if (!container || !pointSelection || mode === "loading" || unprojector === unavailableUnprojector) return;
    const size = getMapSize(container);
    const point = unprojector({ x: size.width / 2, y: size.height / 2 });
    if (!Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)
      || Math.abs(point.longitude) > 180 || Math.abs(point.latitude) > 90
      || (viewportConstraint && !isPointInBounds(point, viewportConstraint.bounds))) return;
    pointSelection.onSelect({ longitude: Number(point.longitude.toFixed(6)), latitude: Number(point.latitude.toFixed(6)) });
  };

  const {
    longPressPosition: _lpPos,
    clearLongPress,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useLongPress(handleLongPress);

  const handleFeedbackSubmit = useCallback(
    async (stressLevel: number, tag: EmotionTag) => {
      if (!feedbackGeoPoint || !feedbackPosition || !feedbackEnabled || feedbackDuplicate || feedbackInFlightRef.current) {
        return;
      }
      feedbackInFlightRef.current = true;
      setSubmitting(true);
      setFeedbackError(null);
      try {
        const result = await feedbackSubmitRef.current({
          location: feedbackGeoPoint,
          stressLevel: stressLevel as MapFeedbackDraft["stressLevel"],
          tag,
        });
        if (result?.status === "duplicate") {
          setFeedbackDuplicate(true);
          return;
        }
        // Only a newly created report produces a fountain.
        const emojiMap: Record<number, string> = {
          0: "😊",
          25: "🙂",
          50: "😐",
          75: "😟",
          100: "😫",
        };
        setFountainPosition(feedbackPosition);
        setFountainEmoji(emojiMap[stressLevel] ?? "✨");
        feedbackOpenRef.current = false;
        setFeedbackPosition(null);
        setFeedbackGeoPoint(null);
        clearLongPress();
      } catch (error) {
        setFeedbackError(error instanceof Error ? error.message : "反馈提交失败，请稍后重试。");
      } finally {
        feedbackInFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [feedbackGeoPoint, feedbackPosition, clearLongPress, feedbackEnabled, feedbackDuplicate],
  );

  const handleFeedbackCancel = useCallback(() => {
    if (feedbackInFlightRef.current) return;
    feedbackOpenRef.current = false;
    setFeedbackPosition(null);
    setFeedbackGeoPoint(null);
    setSubmitting(false);
    setFeedbackError(null);
    setFeedbackDuplicate(false);
    setPanelPosition(null);
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
      onPointerDown={event => {
        if (pointSelection) return;
        if (event.target instanceof Element && event.target.closest('button, [role="dialog"]')) return;
        handlePointerDown(event);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="map-surface__canvas"
        data-testid="map-canvas"
        ref={mapHostRef}
        tabIndex={-1}
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
          interactionEnabled={!feedbackPosition}
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
        <div ref={feedbackLayerRef}>
        <FeedbackPanel
          position={panelPosition ?? feedbackPosition}
          submitting={submitting}
          submissionEnabled={feedbackEnabled}
          error={feedbackError}
          isDuplicate={feedbackDuplicate}
          onCancel={handleFeedbackCancel}
          onSubmit={handleFeedbackSubmit}
        />
        </div>
      )}

      {pointSelection ? <>
        <span className="map-surface__crosshair" aria-hidden="true">＋</span>
        <button className="map-surface__record-here" type="button" onClick={handleSelectCenter}
          disabled={mode === "loading" || unprojector === unavailableUnprojector}>
          {pointSelection.label}
        </button>
      </> : <button className="map-surface__record-here" type="button" onClick={handleRecordHere} ref={recordHereRef}
        disabled={!feedbackEnabled || mode === "loading" || unprojector === unavailableUnprojector || submitting || feedbackPosition !== null}>
        记录此处感受
      </button>}

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
      {heatmapLabel && <div className="map-surface__heatmap-label" aria-label="热力图数据标识">{heatmapLabel}</div>}

      {loading && (
        <div aria-live="polite" className="map-surface__loading" role="status">
          正在更新情绪热力图
        </div>
      )}
    </section>
  );
}
