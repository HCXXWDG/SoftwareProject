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
  return (
    <div className="map-page">
      {state.error && <div className="map-page__error">{state.error}</div>}

      {state.loading && (
        <div className="map-page__loading">
          <span>加载中…</span>
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
