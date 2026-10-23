import { useCallback, useEffect, useRef, useState } from "react";
import { WelcomePage } from "./pages/WelcomePage";
import { RoutePreviewPage } from "./pages/RoutePreviewPage";
import { MapPage } from "./pages/MapPage";
import { RecentQueries } from "./pages/RecentQueries";
import { MapSurface } from "./features/map";
import { RoutePanel } from "./features/routes";
import { TrendPanel } from "./features/trends";
import { CommuteCompletionPanel } from "./features/commute/CommuteCompletionPanel";
import { submitReport } from "./services/report";
import { getDeviceIdentityState } from "./services/api";
import { useHeatmapQuery } from "./hooks/useHeatmapQuery";
import { useTripNavigation } from "./hooks/useTripNavigation";
import { useTrendsHistory } from "./hooks/useTrendsHistory";
import { CAMPUS_VIEWPORT_CONSTRAINT, DEFAULT_DESTINATION, DEFAULT_ORIGIN, WAYPOINTS } from "./config/campus";
import { formatDuration, routePanelPresentation, routeSourceLabel, tripCapabilities } from "./config/capabilities";
import type { BackendStatus, BaseMapMode, GeoPoint, MapFeedbackDraft, RouteComparison } from "./types";
import "./App.css";

function findWaypoint(point: GeoPoint) {
  return WAYPOINTS.find((w) => w.point.longitude === point.longitude && w.point.latitude === point.latitude);
}

export default function App() {
  const { stage, selection, navigate } = useTripNavigation();
  const [comparison, setComparison] = useState<RouteComparison | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string>();
  const [backend, setBackend] = useState<BackendStatus>("unknown");
  const [baseMap, setBaseMap] = useState<BaseMapMode>("loading");
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const feedbackLock = useRef(false);
  const tripEpoch = useRef(0);
  const currentTrip = useRef("");
  currentTrip.current = `${stage}:${selection.origin.longitude}:${selection.origin.latitude}:${selection.destination.longitude}:${selection.destination.latitude}`;
  const heatmap = useHeatmapQuery(stage === "map", setBackend);
  const { trends, history, reloadTrends, reloadHistory } = useTrendsHistory(stage === "map");
  const capabilities = tripCapabilities(comparison, backend, baseMap);
  const identity = getDeviceIdentityState();
  const refreshAfterCommute = useCallback(async () => {
    if (stage !== "map") return;
    const results = await Promise.all([reloadTrends(), reloadHistory()]);
    if (results.some(result => !result)) throw new Error("通勤后的查询尚未更新");
  }, [stage, reloadTrends, reloadHistory]);

  useEffect(() => {
    ++tripEpoch.current;
    if (stage !== "map") {
      setComparison(null); setSelectedRouteId(undefined); setFeedbackNotice(null); setFeedbackSaved(false);
    }
    // A later visit to identical endpoints is still a new trip. Invalidate on unmount too.
    return () => { ++tripEpoch.current; };
  }, [stage, selection.origin.longitude, selection.origin.latitude, selection.destination.longitude, selection.destination.latitude]);

  const startPreview = useCallback((origin: GeoPoint, destination: GeoPoint, originName: string, destName: string) => {
    setComparison(null); setSelectedRouteId(undefined); setFeedbackNotice(null); setFeedbackSaved(false);
    navigate("route-preview", { origin, destination, originName, destName });
  }, [navigate]);
  const enterMap = useCallback((result: RouteComparison) => {
    if (!result.routes.length) return;
    setComparison(result);
    setSelectedRouteId(result.routes.find((r) => r.id === result.fastestRouteId)?.id ?? result.routes[0].id);
    navigate("map");
  }, [navigate]);
  const handleFeedbackSubmit = useCallback(async (draft: MapFeedbackDraft) => {
    if (!capabilities.canReport) throw new Error("反馈服务暂不可用，请先重试连接。");
    if (feedbackLock.current) throw new Error("反馈正在提交，请稍候。");
    feedbackLock.current = true;
    const trip = currentTrip.current;
    const epoch = tripEpoch.current;
    const isCurrentTrip = () => epoch === tripEpoch.current && currentTrip.current === trip;
    setFeedbackNotice(null); setFeedbackSaved(false);
    try {
      const result = await submitReport({ ...draft, reportedAt: new Date().toISOString() });
      if (!isCurrentTrip()) return;
      setBackend("available");
      setFeedbackSaved(true);
      if (result.status === "duplicate") {
        setFeedbackNotice("这条反馈已提交过，无需重复提交。");
        return result;
      }
      const refreshed = await heatmap.setScope("REAL_ONLY", true);
      if (!isCurrentTrip()) return;
      setFeedbackNotice(refreshed === "success" ? "反馈已提交，当前视口热力图已更新。"
        : refreshed === "failed" ? "反馈已提交，但地图刷新失败。请仅重试刷新地图。"
        : "反馈已提交，地图将显示最新视口的查询结果。");
      return result;
    } catch (error) {
      if (!isCurrentTrip()) return;
      setFeedbackNotice(error instanceof Error ? error.message : "反馈提交失败，请稍后重试。");
      throw error;
    } finally { feedbackLock.current = false; }
  }, [capabilities.canReport, heatmap.setScope]);

  const completionPanel = <CommuteCompletionPanel comparison={comparison} selectedRouteId={selectedRouteId}
    backend={backend} baseMap={baseMap} active={stage === "map" && comparison !== null}
    contextKey={`${currentTrip.current}:${tripEpoch.current}:${comparison?.snapshotId ?? ""}`}
    onSaved={refreshAfterCommute} onNewTrip={() => navigate("route-preview")} />;

  if (stage === "welcome") return <>
    {completionPanel}
    <WelcomePage key={JSON.stringify(selection)}
      initialOriginId={findWaypoint(selection.origin)?.id ?? DEFAULT_ORIGIN.id}
      initialDestinationId={findWaypoint(selection.destination)?.id ?? DEFAULT_DESTINATION.id}
      initialOrigin={findWaypoint(selection.origin) ?? { id: "history-origin", name: selection.originName, point: selection.origin }}
      initialDestination={findWaypoint(selection.destination) ?? { id: "history-destination", name: selection.destName, point: selection.destination }}
      onNavigateToPreview={startPreview} />
  </>;
  if (stage === "route-preview" || !comparison) return <>{completionPanel}<RoutePreviewPage
    origin={selection.origin} destination={selection.destination} originName={selection.originName} destName={selection.destName}
    onBack={() => navigate("welcome")} onEnterMap={enterMap} onBackendStatus={setBackend} /></>;

  const displayRoutes = capabilities.showScores ? comparison.routes
    : comparison.routes.map((route) => ({ ...route, leastStressful: false }));
  return <>{completionPanel}<main className="app-map-shell">
    <header className="app-header">
      <button className="app-brand" type="button" aria-label="心途首页" onClick={() => navigate("welcome")}>
        <svg aria-hidden="true" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="13" fill="currentColor"/><path d="M11 27c0-8 18 2 18-9 0-7-8-8-8-1 0 4 5 3 5-1" stroke="#d9ef6d" strokeWidth="3" strokeLinecap="round"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg>
        <span><strong>心途</strong><small>XINTU CAMPUS</small></span>
      </button>
      <span className="app-campus">江南大学 · 蠡湖校区</span>
    </header>
    <nav className="app-toolbar" aria-label="通勤导航">
      <button type="button" onClick={() => navigate("welcome")}>修改起终点</button>
      <button type="button" onClick={() => navigate("route-preview")}>重新规划</button>
      <button type="button" onClick={() => { void heatmap.refresh(); }}>刷新地图</button>
      <span>{selection.originName} → {selection.destName}</span>
    </nav>
    <section className="app-status" aria-label="服务状态">
      <p>{routeSourceLabel(comparison)}</p>
      <p>底图：{baseMap === "amap" ? "在线地图" : baseMap === "offline" ? "离线底图" : "加载中"}；
        数据服务：{backend === "available" ? "可连接" : backend === "unavailable" ? "暂不可用" : "待确认"}</p>
      {!capabilities.canReport && <p>反馈暂不可用，请点击刷新地图重试连接。</p>}
      {identity.storageRestricted && <p role="status">{identity.message}</p>}
      {feedbackNotice && <p role={feedbackSaved ? "status" : "alert"}>{feedbackNotice}</p>}
    </section>
    <MapPage heatmapScope={heatmap.scope} onHeatmapScopeChange={heatmap.setScope}
      state={{ heatmapCells: heatmap.cells, loading: heatmap.loading, error: heatmap.error, routeComparison: comparison, trend: trends.data }}
      mapSlot={<MapSurface heatmapCells={heatmap.cells} routes={displayRoutes} selectedRouteId={selectedRouteId}
          heatmapLabel={heatmap.scope === "SIMULATED_ONLY" ? "演示热力图 · 模拟反馈" : "真实反馈热力图"}
          loading={heatmap.loading} onFeedbackSubmit={handleFeedbackSubmit} feedbackEnabled={capabilities.canReport}
          onFeedbackOpen={() => { setFeedbackNotice(null); setFeedbackSaved(false); }}
        onRouteSelect={(id) => { if (comparison.routes.some((r) => r.id === id)) setSelectedRouteId(id); }}
        onViewportChange={heatmap.updateViewport} onModeChange={setBaseMap}
        origin={selection.origin} destination={selection.destination} viewportConstraint={CAMPUS_VIEWPORT_CONSTRAINT} />} />
    {capabilities.showScores ? <RoutePanel {...routePanelPresentation(comparison)} routes={comparison.routes} selectedRouteId={selectedRouteId} onSelectRoute={setSelectedRouteId} />
      : <nav className="app-route-choices" aria-label="路线对比">
        {comparison.routes.map((route) => <button key={route.id} type="button" aria-label={`选择 ${route.label}`}
          aria-pressed={selectedRouteId === route.id} onClick={() => setSelectedRouteId(route.id)}>
          {route.label} · {Math.round(route.distanceMeters)} 米 · 预计 {formatDuration(route.durationSeconds)}
        </button>)}
        <p>当前无有效评分，不展示舒适标签。</p>
      </nav>}
    <section className="app-status" aria-label="趋势查询状态">
      {trends.status === "loading" && <p role="status">正在加载趋势…</p>}
      {trends.error && <p role="alert">趋势加载失败：{trends.error}</p>}
      {trends.refreshError && <p role="status">显示上次趋势，刷新失败：{trends.refreshError}</p>}
      <button type="button" disabled={trends.status === "loading" || trends.refreshing} onClick={() => { void reloadTrends(); }}>重试或刷新趋势</button>
      {trends.status === "empty" && <p>暂无通勤记录。</p>}
      {(trends.data?.unknownSourceCommutes ?? 0) > 0 && <p>含 {trends.data!.unknownSourceCommutes} 次来源待确认的通勤，不能视为真实路线评分。</p>}
      {(trends.data?.excludedDemoCommutes ?? 0) > 0 && <p>已从趋势中排除 {trends.data!.excludedDemoCommutes} 次演示通勤。</p>}
      {trends.data && <TrendPanel trend={trends.data} />}
    </section>
    <RecentQueries state={history} onRetry={() => { void reloadHistory(); }} onReplan={(origin, destination) => {
      startPreview(origin, destination, findWaypoint(origin)?.name ?? "历史起点", findWaypoint(destination)?.name ?? "历史终点");
    }} />
  </main></>;
}
