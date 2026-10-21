import { useEffect, useCallback, useState } from "react";
import { MOCK_ROUTE_COMPARISON } from "../config/mockRoutes";
import { compareRoutes } from "../services/route";
import type { GeoPoint, RoutePreviewState, RouteComparison } from "../types";
import "./RoutePreviewPage.css";

interface RoutePreviewPageProps {
  origin: GeoPoint;
  destination: GeoPoint;
  originName: string;
  destName: string;
  onEnterMap: (comparison: RouteComparison, isOfflineFallback: boolean) => void;
}

const initialState: RoutePreviewState = {
  loading: true,
  error: null,
  routeComparison: null,
  isOfflineFallback: false,
};

/**
 * 路线预览页 — 三阶段流程的第二阶段。
 * 调用 compareRoutes 展示固定端点和两条候选路线。
 * 失败时提供重试和"进入离线地图"，不伪造后端评分。
 */
export function RoutePreviewPage({ origin, destination, originName, destName, onEnterMap }: RoutePreviewPageProps) {
  const [state, setState] = useState<RoutePreviewState>(initialState);

  const loadRoutes = useCallback(async () => {
    setState({ loading: true, error: null, routeComparison: null, isOfflineFallback: false });
    try {
      const comparison = await compareRoutes({
        origin,
        destination,
      });
      setState({ loading: false, error: null, routeComparison: comparison, isOfflineFallback: false });
    } catch {
      setState({ loading: false, error: null, routeComparison: MOCK_ROUTE_COMPARISON, isOfflineFallback: true });
    }
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const handleEnterOfflineMap = () => {
    onEnterMap(MOCK_ROUTE_COMPARISON, true);
  };

  const handleEnterMap = () => {
    if (state.routeComparison) {
      onEnterMap(state.routeComparison, state.isOfflineFallback);
    }
  };

  return (
    <div className="route-preview-page">
      <div className="route-preview-page__content">
        <h2 className="route-preview-page__title">预设路线</h2>
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
