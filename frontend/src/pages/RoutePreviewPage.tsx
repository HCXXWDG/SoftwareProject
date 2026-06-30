import { useEffect, useCallback, useState } from "react";
import { generateMockRoutes } from "../config/mockRoutes";
import { compareRoutes } from "../services/route";
import type { RoutePreviewState, RouteComparison, GeoPoint } from "../types";
import "./RoutePreviewPage.css";

interface RoutePreviewPageProps {
  origin: GeoPoint;
  destination: GeoPoint;
  originName: string;
  destName: string;
  onEnterMap: (comparison: RouteComparison, isOfflineFallback: boolean) => void;
  onBack?: () => void;
}

const initialState: RoutePreviewState = {
  loading: true,
  error: null,
  routeComparison: null,
  isOfflineFallback: false,
};

/**
 * 路线预览页 — 三阶段流程的第二阶段。
 * 接收 props 传入的 origin/destination，调用 compareRoutes 获取路线。
 * 失败时 fallback 到 generateMockRoutes 动态生成模拟路线。
 */
export function RoutePreviewPage({
  origin,
  destination,
  originName,
  destName,
  onEnterMap,
  onBack,
}: RoutePreviewPageProps) {
  const [state, setState] = useState<RoutePreviewState>(initialState);

  const loadRoutes = useCallback(async () => {
    setState({ loading: true, error: null, routeComparison: null, isOfflineFallback: false });
    try {
      const comparison = await compareRoutes({ origin, destination });
      setState({ loading: false, error: null, routeComparison: comparison, isOfflineFallback: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "路线请求失败";
      setState({ loading: false, error: msg, routeComparison: null, isOfflineFallback: false });
    }
  }, [origin, destination]);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const handleEnterOfflineMap = () => {
    const mockComparison = generateMockRoutes(origin, destination);
    onEnterMap(mockComparison, true);
  };

  const handleEnterMap = () => {
    if (state.routeComparison) {
      onEnterMap(state.routeComparison, state.isOfflineFallback);
    }
  };

  return (
    <div className="route-preview-page">
      <div className="route-preview-page__content">
        {onBack && (
          <button
            className="route-preview-page__back-btn"
            onClick={onBack}
            type="button"
          >
            ← 重新选择
          </button>
        )}

        <h2 className="route-preview-page__title">推荐路线</h2>
        <p className="route-preview-page__route-info">
          {originName} → {destName}
        </p>

        {state.loading && (
          <div className="route-preview-page__loading" role="status">
            <span className="route-preview-page__spinner" />
            <span>正在获取路线数据…</span>
          </div>
        )}

        {!state.loading && state.error && (
          <div className="route-preview-page__error" role="alert">
            <p>{state.error}</p>
            <div className="route-preview-page__error-actions">
              <button
                className="route-preview-page__retry-btn"
                onClick={loadRoutes}
                type="button"
              >
                重试
              </button>
              <button
                className="route-preview-page__offline-btn"
                onClick={handleEnterOfflineMap}
                type="button"
              >
                进入离线地图
              </button>
            </div>
          </div>
        )}

        {!state.loading && state.routeComparison && (
          <>
            {state.isOfflineFallback && (
              <div className="route-preview-page__offline-notice" role="status">
                离线模式：仅显示路线走向，评分数据暂不可用
              </div>
            )}

            <div className="route-preview-page__routes">
              {state.routeComparison.routes.map((route) => (
                <div
                  key={route.id}
                  className={`route-preview-page__card ${
                    route.fastest ? "route-preview-page__card--fastest" : ""
                  } ${route.leastStressful ? "route-preview-page__card--least-stressful" : ""}`}
                >
                  <div className="route-preview-page__card-header">
                    <span className="route-preview-page__card-label">
                      {route.label}
                    </span>
                    {route.fastest && (
                      <span className="route-preview-page__badge route-preview-page__badge--fastest">
                        最快
                      </span>
                    )}
                    {route.leastStressful && (
                      <span className="route-preview-page__badge route-preview-page__badge--calm">
                        最少心累
                      </span>
                    )}
                  </div>
                  <div className="route-preview-page__card-body">
                    <span>{Math.round(route.distanceMeters)} 米</span>
                    <span>{Math.round(route.durationSeconds / 60)} 分钟</span>
                    {!state.isOfflineFallback && (
                      <span>心累指数 {Math.round(route.stressScore)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {state.routeComparison.recommendation && (
              <p className="route-preview-page__recommendation">
                {state.routeComparison.recommendation}
              </p>
            )}

            <button
              className="route-preview-page__cta"
              onClick={handleEnterMap}
              type="button"
            >
              进入地图
            </button>
          </>
        )}
      </div>
    </div>
  );
}
