import { type ReactNode } from "react";
import type { MapPageState } from "../types";
import "./MapPage.css";

export interface MapPageProps {
  /** 页面状态通过 Props 传入，由上层（App）管理 */
  state: MapPageState;
  /** 地图渲染插槽，由 C（地图交互）成员注入高德地图实例 */
  mapSlot?: ReactNode;
}

/**
 * 地图容器页面。
 * - 桌面 min-height ≥ 600px
 * - 手机视口 min-height ≥ 520px
 * - 无业务代码，状态全量通过 Props 接收
 */
export function MapPage({ state, mapSlot }: MapPageProps) {
  const { heatmapCells, loading, error } = state;
  const hasData = heatmapCells.length > 0;

  return (
    <div className="map-page">
      {error && (
        <div className="map-page__error" role="alert">
          <span className="map-page__error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="map-page__loading" role="status">
          <span className="map-page__spinner" />
          <span>正在加载热力图数据…</span>
        </div>
      )}

      {!loading && !error && hasData && (
        <div className="map-page__summary" role="status" aria-label="数据摘要">
          <span className="map-page__badge">{heatmapCells.length}</span>
          <span className="map-page__label">个热力图单元格已加载</span>
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
  );
}
