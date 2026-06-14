import { useState, useEffect, useCallback, useRef } from "react";
import { MapPage } from "./pages/MapPage";
import { MapSurface } from "./features/map";
import { RoutePanel } from "./features/routes";
import { TrendPanel } from "./features/trends";
import { fetchHeatmap } from "./services/heatmap";
import { compareRoutes } from "./services/route";
import { fetchTrends, completeCommute } from "./services/commute";
import { submitReport } from "./services/report";
import type { MapPageState, HeatmapCell, GeoPoint, MapFeedbackDraft } from "./types";

const initialMapState: MapPageState = {
  heatmapCells: [],
  loading: false,
  error: null,
  routeComparison: null,
  trend: null,
  selectedOrigin: null,
  selectedDestination: null,
};

/** 默认地图视口 bbox（北京西直门附近，匹配后端 Demo 数据区域） */
const DEFAULT_BBOX = "116.39,39.90,116.41,39.92";
/** 预设 Demo 起终点（与后端 ApiSmokeTest 一致） */
const DEMO_ORIGIN: GeoPoint = { longitude: 116.395, latitude: 39.905 };
const DEMO_DESTINATION: GeoPoint = { longitude: 116.405, latitude: 39.910 };
const DEBOUNCE_MS = 300;

/** 后端允许的压力等级集合 */
const VALID_STRESS_LEVELS = [0, 25, 50, 75, 100] as const;

/** 将任意压力分数吸附到后端允许的五档值 */
export function snapStressLevel(score: number): number {
  let nearest: number = VALID_STRESS_LEVELS[0];
  let minDist = Math.abs(score - nearest);
  for (const level of VALID_STRESS_LEVELS) {
    const dist = Math.abs(score - level);
    if (dist < minDist) {
      nearest = level;
      minDist = dist;
    }
  }
  return nearest;
}

function App() {
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
    // 取消进行中的旧请求
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

  /** 路线选择（由地图路线或面板点击触发） */
  const handleRouteSelect = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);
  }, []);

  /** 完成本次通勤：使用用户真实压力档位，分离 POST 与趋势刷新错误 */
  const handleCompleteCommute = useCallback(async () => {
    const comparison = mapState.routeComparison;
    if (!comparison) return;
    if (userStressLevel == null) return; // 未选择压力档位时不提交

    const selectedId = selectedRouteId ?? comparison.fastestRouteId;
    const selected = comparison.routes.find((r) => r.id === selectedId);
    if (!selected) return;

    const fastest = comparison.routes.find((r) => r.id === comparison.fastestRouteId);
    const alternative = comparison.routes.find((r) => r.id === comparison.leastStressfulRouteId);

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

      // 刷新趋势数据（POST 已成功，刷新失败仅提示警告，不视为通勤失败）
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

  /** 首次加载：热力图 + 路线对比 + 通勤趋势 */
  useEffect(() => {
    loadHeatmap(DEFAULT_BBOX);

    (async () => {
      try {
        const [comparison, trend] = await Promise.all([
          compareRoutes({ origin: DEMO_ORIGIN, destination: DEMO_DESTINATION }),
          fetchTrends(),
        ]);
        setMapState((prev) => ({
          ...prev,
          routeComparison: comparison,
          trend,
          selectedOrigin: DEMO_ORIGIN,
          selectedDestination: DEMO_DESTINATION,
        }));
      } catch {
        // 后端不可用时静默降级，页面仍可显示热力图
      }
    })();

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortRef.current?.abort();
    };
  }, [loadHeatmap]);

  return (
    <>
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
