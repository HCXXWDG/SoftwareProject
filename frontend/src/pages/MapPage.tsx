import { type ReactNode } from "react";
import type { MapPageState } from "../types";
import type { HeatmapScope } from "../services/heatmap";
import "./MapPage.css";

export interface MapPageProps {
  /** 页面状态通过 Props 传入，由上层（App）管理 */
  state: MapPageState;
  /** 地图渲染插槽，由 C（地图交互）成员注入高德地图实例 */
  mapSlot?: ReactNode;
  heatmapScope?: HeatmapScope;
  onHeatmapScopeChange?: (scope: HeatmapScope) => void;
}

/**
 * 地图容器页面。
 * - 桌面 min-height ≥ 600px
 * - 手机视口 min-height ≥ 520px
 * - 无业务代码，状态全量通过 Props 接收
 */
export function MapPage({ state, mapSlot, heatmapScope = "REAL_ONLY", onHeatmapScopeChange }: MapPageProps) {
  const { heatmapCells, loading, error } = state;
  const hasData = heatmapCells.length > 0;
  const demo = heatmapScope === "SIMULATED_ONLY";

  return (
    <div className="map-page">
      <section className={`map-page__source${demo ? " map-page__source--demo" : ""}`} aria-label="热力图来源">
        {onHeatmapScopeChange && <div className="map-page__source-options" role="group" aria-label="选择热力图数据">
          <button type="button" aria-pressed={!demo} onClick={() => onHeatmapScopeChange("REAL_ONLY")}>真实反馈</button>
          <button type="button" aria-pressed={demo} onClick={() => onHeatmapScopeChange("SIMULATED_ONLY")}>演示热力图</button>
        </div>}
        <p>{demo ? "当前显示：演示热力图（模拟反馈）。不影响路线规划、评分或真实统计。"
          : "当前显示：真实反馈热力图，统计当前地图范围内近 7 天的情绪反馈。"}</p>
        {!loading && !error && !hasData && <p className="map-page__empty">
          {demo ? "当前地图范围近 7 天暂无模拟反馈，可移动地图查看其他校园区域，或切回真实反馈。"
            : "当前地图范围近 7 天暂无真实反馈，因此暂时没有热力点。可在地图上点“记录此处感受”提交反馈，或切换演示热力图查看效果。"}
        </p>}
      </section>
      {error && (
        <div className="map-page__error" role="alert">
          <span className="map-page__error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && hasData && (
        <div className="map-page__summary" role="status" aria-label="数据摘要">
          <span className="map-page__badge">{heatmapCells.length}</span>
          <span className="map-page__label">个热力图单元格已加载{demo ? "（模拟反馈）" : "（真实反馈）"}</span>
        </div>
      )}

      <div className="map-page__viewport">
      {loading && !mapSlot && (
        <div className="map-page__loading" role="status">
          <span className="map-page__spinner" />
          <span>正在加载热力图数据…</span>
        </div>
      )}
      {mapSlot ?? (
        <div className="map-page__placeholder">
          <span role="img" aria-label="map">
            🗺️
          </span>
          <span>地图区域 — 等待地图交互组件注入</span>
        </div>
      )}
      </div>
    </div>
  );
}
