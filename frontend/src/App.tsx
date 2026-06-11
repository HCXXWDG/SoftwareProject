import { useState, useEffect, useCallback, useRef } from "react";
import { MapPage } from "./pages/MapPage";
import { MapSurface } from "./features/map";
import { fetchHeatmap } from "./services/heatmap";
import { compareRoutes } from "./services/route";
import { fetchTrends } from "./services/commute";
import type { MapPageState, HeatmapCell, GeoPoint } from "./types";

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
/** 标准 demo 起终点（与后端 ApiSmokeTest 一致） */
const DEMO_ORIGIN: GeoPoint = { longitude: 116.395, latitude: 39.905 };
const DEMO_DESTINATION: GeoPoint = { longitude: 116.405, latitude: 39.910 };
const DEBOUNCE_MS = 300;

function App() {
  const [mapState, setMapState] = useState<MapPageState>(initialMapState);
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
    <MapPage
      state={mapState}
      mapSlot={
        <MapSurface
          heatmapCells={mapState.heatmapCells}
          loading={mapState.loading}
          onViewportChange={handleViewportChange}
        />
      }
    />
  );
}

export default App;
