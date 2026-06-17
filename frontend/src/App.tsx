import { useState, useEffect, useCallback, useRef } from "react";
import { WelcomePage } from "./pages/WelcomePage";
import { RoutePreviewPage } from "./pages/RoutePreviewPage";
import { MapPage } from "./pages/MapPage";
import { MapSurface } from "./features/map";
import { RoutePanel } from "./features/routes";
import { TrendPanel } from "./features/trends";
import { fetchHeatmap } from "./services/heatmap";
import { fetchTrends, completeCommute } from "./services/commute";
import { submitReport } from "./services/report";
import { CAMPUS_DEFAULT_BBOX } from "./config/campus";
import type {
  AppStage,
  MapPageState,
  HeatmapCell,
  RouteComparison,
  MapFeedbackDraft,
} from "./types";

const initialMapState: MapPageState = {
  heatmapCells: [],
  loading: false,
  error: null,
  routeComparison: null,
  trend: null,
};

const DEBOUNCE_MS = 300;

function App() {
  const [stage, setStage] = useState<AppStage>("welcome");
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);
  const [mapState, setMapState] = useState<MapPageState>(initialMapState);
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>();
  const [userStressLevel, setUserStressLevel] = useState<number | null>(null);
  const [completingCommute, setCompletingCommute] = useState(false);
  const [completeCommuteError, setCompleteCommuteError] = useState<string | null>(null);
  const [trendRefreshWarning, setTrendRefreshWarning] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** 获取热力图（自动取消旧请求，避免竞态） */
  const loadHeatmap = useCallback(async (bbox: string, zoom?: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setMapState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const cells: HeatmapCell[] = await fetchHeatmap(bbox, zoom, 168, controller.signal);
      setMapState((prev) => ({ ...prev, heatmapCells: cells, loading: false }));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "加载热力图数据失败";
      setMapState((prev) => ({ ...prev, loading: false, error: msg }));
    }
  }, []);

  /** 视口变化：300ms 防抖后请求热力图 */
  const handleViewportChange = useCallback(
    (bbox: string, zoom: number) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        loadHeatmap(bbox, zoom);
      }, DEBOUNCE_MS);
    },
    [loadHeatmap],
  );

  /** 提交情绪反馈（由地图长按触发） */
  const handleFeedbackSubmit = useCallback(
    async (draft: MapFeedbackDraft) => {
      await submitReport({
        location: draft.location,
        stressLevel: draft.stressLevel,
        tag: draft.tag,
        reportedAt: new Date().toISOString(),
      });
    },
    [],
  );

  /** 路线选择 */
  const handleRouteSelect = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);
  }, []);

  /** 完成本次通勤 */
  const handleCompleteCommute = useCallback(async () => {
    const comparison = mapState.routeComparison;
    if (!comparison) return;
    if (userStressLevel == null) return;

    const selectedId = selectedRouteId ?? comparison.fastestRouteId;
    const selected = comparison.routes.find((r) => r.id === selectedId);
    if (!selected) return;

    const fastest = comparison.routes.find((r) => r.id === comparison.fastestRouteId);
    const leastStressful = comparison.routes.find((r) => r.id === comparison.leastStressfulRouteId);
    const alternative =
      leastStressful && leastStressful.id !== selectedId
        ? leastStressful
        : comparison.routes.find((r) => r.id === comparison.fastestRouteId && r.id !== selectedId)
          ?? comparison.routes.find((r) => r.id !== selectedId);

    setCompletingCommute(true);
    setCompleteCommuteError(null);
    setTrendRefreshWarning(null);
    let postSucceeded = false;
    try {
      await completeCommute({
        routeId: selected.id,
        routeLabel: selected.label,
        endStressLevel: userStressLevel,
        durationMinutes: Math.round(selected.durationSeconds / 60),
        selectedScore: selected.stressScore,
        fastestScore: fastest?.stressScore ?? selected.stressScore,
        alternativeLabel: alternative?.label,
        alternativeScore: alternative?.stressScore,
        alternativeDurationRatio:
          alternative && fastest
            ? alternative.durationSeconds / fastest.durationSeconds
            : undefined,
        confidence: selected.confidence,
        completedAt: new Date().toISOString(),
      });
      postSucceeded = true;

      try {
        const freshTrend = await fetchTrends();
        setMapState((prev) => ({ ...prev, trend: freshTrend }));
      } catch {
        setTrendRefreshWarning("通勤已记录，但趋势数据刷新失败，请稍后刷新页面查看");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "完成通勤失败，请稍后重试";
      setCompleteCommuteError(msg);
    } finally {
      setCompletingCommute(false);
      if (postSucceeded) setUserStressLevel(null);
    }
  }, [mapState.routeComparison, selectedRouteId, userStressLevel]);

  /** 路线预览 → 地图阶段：设置路线对比数据并加载热力图+趋势 */
  const handleEnterMap = useCallback(
    (comparison: RouteComparison, offline: boolean) => {
      setIsOfflineFallback(offline);
      setMapState((prev) => ({ ...prev, routeComparison: comparison }));
      setStage("map");
    },
    [],
  );

  /** 进入地图阶段时加载热力图和趋势 */
  useEffect(() => {
    if (stage !== "map") return;

    loadHeatmap(CAMPUS_DEFAULT_BBOX);

    (async () => {
      try {
        const trend = await fetchTrends();
        setMapState((prev) => ({ ...prev, trend }));
      } catch {
        // 后端不可用时静默降级
      }
    })();

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortRef.current?.abort();
    };
  }, [stage, loadHeatmap]);

  // ── Stage: welcome ──
  if (stage === "welcome") {
    return <WelcomePage onNavigateToPreview={() => setStage("route-preview")} />;
  }

  // ── Stage: route-preview ──
  if (stage === "route-preview") {
    return <RoutePreviewPage onEnterMap={handleEnterMap} />;
  }

  // ── Stage: map ──
  return (
    <>
      {isOfflineFallback && (
        <div className="map-offline-banner" role="status">
          离线模式 — 评分数据暂不可用
        </div>
      )}
      <MapPage
        state={mapState}
        mapSlot={
          <MapSurface
            heatmapCells={mapState.heatmapCells}
            routes={mapState.routeComparison?.routes ?? []}
            selectedRouteId={selectedRouteId ?? mapState.routeComparison?.fastestRouteId}
            loading={mapState.loading}
            onFeedbackSubmit={handleFeedbackSubmit}
            onRouteSelect={handleRouteSelect}
            onViewportChange={handleViewportChange}
          />
        }
      />
      {mapState.routeComparison && (
        <RoutePanel
          routes={mapState.routeComparison.routes}
          selectedRouteId={selectedRouteId ?? mapState.routeComparison.fastestRouteId}
          onSelectRoute={handleRouteSelect}
        />
      )}
      <TrendPanel
        trend={mapState.trend}
        onCompleteCommute={handleCompleteCommute}
        completing={completingCommute}
        error={completeCommuteError}
        disabled={!mapState.routeComparison}
        userStressLevel={userStressLevel}
        onStressLevelChange={setUserStressLevel}
        trendRefreshWarning={trendRefreshWarning}
      />
    </>
  );
}

export default App;
