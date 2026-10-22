import { useCallback, useEffect, useRef, useState } from "react";
import { findDemoRoutes } from "../config/mockRoutes";
import { formatDuration, routeSourceLabel, tripCapabilities } from "../config/capabilities";
import { ApiError, isRequestCancelled } from "../services/api";
import { compareRoutes } from "../services/route";
import type { GeoPoint, RouteComparison, RoutePreviewState } from "../types";
import "./RoutePreviewPage.css";

interface RoutePreviewPageProps {
  origin: GeoPoint; destination: GeoPoint; originName: string; destName: string;
  onEnterMap: (comparison: RouteComparison, isOfflineFallback: boolean) => void;
  onBack?: () => void;
  onBackendStatus?: (status: "available" | "unavailable") => void;
}
const initialState: RoutePreviewState = { loading: true, error: null, routeComparison: null, isOfflineFallback: false };

/** 错误保持为错误；演示由用户明确选择并匹配端点。 */
export function RoutePreviewPage({ origin, destination, originName, destName, onEnterMap, onBack, onBackendStatus }: RoutePreviewPageProps) {
  const [state, setState] = useState(initialState);
  const [attempt, setAttempt] = useState(0);
  const requestVersion = useRef(0);
  const backendCallback = useRef(onBackendStatus);
  backendCallback.current = onBackendStatus;
  const demo = findDemoRoutes(origin, destination);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    setState(initialState);
    compareRoutes({ origin, destination }, controller.signal).then((comparison) => {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      backendCallback.current?.("available");
      setState({ loading: false, error: null, routeComparison: comparison, isOfflineFallback: comparison.routeSource === "DEMO" });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || version !== requestVersion.current || isRequestCancelled(error)) return;
      backendCallback.current?.(error instanceof ApiError && ["network", "timeout"].includes(error.kind) ? "unavailable" : "available");
      setState({ loading: false, error: error instanceof Error ? error.message : "路线查询失败，请重试。", routeComparison: null, isOfflineFallback: false });
    });
    return () => controller.abort();
  }, [origin.longitude, origin.latitude, destination.longitude, destination.latitude, attempt]);

  const enterDemo = useCallback(() => { if (demo) onEnterMap(demo, true); }, [demo, onEnterMap]);
  const comparison = state.routeComparison;
  const showScores = tripCapabilities(comparison, "available", "loading").showScores;

  return <div className="route-preview-page"><div className="route-preview-page__content">
    {onBack && <button type="button" onClick={onBack}>修改起终点</button>}
    <h2 className="route-preview-page__title">路线预览</h2>
    <p className="route-preview-page__route-info">{originName} → {destName}</p>
    {state.loading && <div role="status">正在获取路线数据…</div>}
    {!state.loading && state.error && <div className="route-preview-page__error" role="alert">
      <p>{state.error}</p><button type="button" onClick={() => setAttempt((n) => n + 1)}>重试</button>
    </div>}
    {!state.loading && comparison && <>
      <p role="status">{routeSourceLabel(comparison)}</p>
      {comparison.routes.length === 0 ? <p role="status">当前起终点没有可用路线，请修改端点或重试。</p>
        : <div className="route-preview-page__routes">{comparison.routes.map((route) => <div key={route.id} className="route-preview-page__card">
          <div className="route-preview-page__card-header"><span>{route.label}</span>
            {route.fastest && <span className="route-preview-page__badge">最快</span>}
            {showScores && route.leastStressful && <span className="route-preview-page__badge">最少心累</span>}
          </div>
          <div className="route-preview-page__card-body"><span>{Math.round(route.distanceMeters)} 米</span>
            <span>预计 {formatDuration(route.durationSeconds)}</span>
            {showScores && route.stressScore != null && <span>心累指数 {Math.round(route.stressScore)}</span>}
          </div>
        </div>)}</div>}
      {showScores && comparison.recommendation && <p>{comparison.recommendation}</p>}
      {comparison.routes.length > 0 && <button className="route-preview-page__cta" type="button" onClick={() => onEnterMap(comparison, state.isOfflineFallback)}>进入地图</button>}
      <button type="button" onClick={() => setAttempt((n) => n + 1)}>重新查询路线</button>
    </>}
    {!state.loading && <div className="route-preview-page__error-actions">
      {demo ? <button type="button" onClick={enterDemo}>查看匹配的演示路线</button> : <p>这组起终点没有配置演示路线。</p>}
    </div>}
  </div></div>;
}
