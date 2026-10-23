import type { AsyncQueryState } from "../hooks/useTrendsHistory";
import type { RouteQueryHistory } from "../services/history";
import type { GeoPoint } from "../types";
import { WAYPOINTS, isPointInServiceArea } from "../config/serviceArea";
import "./RecentQueries.css";

interface RecentQueriesProps {
  state: AsyncQueryState<RouteQueryHistory[]>;
  onRetry: () => void;
  onReplan: (origin: GeoPoint, destination: GeoPoint) => void;
}

function pointLabel(point: GeoPoint): string {
  const waypoint = WAYPOINTS.find(({ point: candidate }) =>
    Math.abs(point.longitude - candidate.longitude) < 0.000001
    && Math.abs(point.latitude - candidate.latitude) < 0.000001);
  return waypoint?.name ?? `${point.longitude.toFixed(5)}, ${point.latitude.toFixed(5)}`;
}

function queryTime(isoTime: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(isoTime));
}

export function RecentQueries({ state, onRetry, onReplan }: RecentQueriesProps) {
  return (
    <section className="recent-queries" aria-label="最近查询" aria-busy={state.status === "loading" || state.refreshing}>
      <div className="recent-queries__header">
        <h2>最近查询</h2>
        <button type="button" onClick={onRetry} disabled={state.status === "loading" || state.refreshing}>
          {state.refreshing ? "刷新中…" : "刷新历史"}
        </button>
      </div>
      {state.status === "idle" && <p>尚未查询历史记录。</p>}
      {state.status === "loading" && <p role="status">正在加载查询历史…</p>}
      {state.status === "empty" && <p>暂无查询历史；演示服务可能不保存历史。</p>}
      {state.status === "error" && (
        <div role="alert">
          <p>查询历史加载失败：{state.error}</p>
          <button type="button" onClick={onRetry}>重试查询历史</button>
        </div>
      )}
      {state.refreshError && (
        <div role="alert" className="recent-queries__warning">
          <p>历史刷新失败，仍显示上次记录：{state.refreshError}</p>
          <button type="button" onClick={onRetry}>重试刷新历史</button>
        </div>
      )}
      {state.data && state.data.length > 0 && (
        <>
          <p>选择历史记录将恢复起终点并重新查询路线。</p>
          <ul>
            {state.data.map((entry) => (
              <li key={entry.id}>
                <div>
                  <span>{pointLabel(entry.origin)} → {pointLabel(entry.destination)}</span>
                  <time dateTime={entry.createdAt}>{queryTime(entry.createdAt)}</time>
                  {(!isPointInServiceArea(entry.origin) || !isPointInServiceArea(entry.destination)) && <small>此历史行程不在当前梁溪区地图范围，已保留记录。</small>}
                </div>
                <button type="button" disabled={!isPointInServiceArea(entry.origin) || !isPointInServiceArea(entry.destination)} onClick={() => onReplan({ ...entry.origin }, { ...entry.destination })}>重新规划</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
