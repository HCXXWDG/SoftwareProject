import type { ScoredRoute } from "../../types";
import { formatDuration } from "../../config/capabilities";
import "./RoutePanel.css";

interface RoutePanelProps {
  routes: ScoredRoute[];
  selectedRouteId?: string;
  onSelectRoute: (routeId: string) => void;
  /** Presentation values adapted from the canonical route/feedback contract by A. */
  routeSource?: "real" | "mock" | "unknown";
  scoringStatus?: "valid" | "insufficient" | "none";
}

function isValidScore(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value >= 0 && value <= 100;
}

function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

export function RoutePanel({
  routes,
  selectedRouteId,
  onSelectRoute,
  routeSource,
  scoringStatus,
}: RoutePanelProps) {
  if (!routes || routes.length === 0) {
    return null;
  }

  return (
    <div aria-label="路线对比" className="route-panel" data-testid="route-panel">
      {routeSource === "unknown" && <p className="route-panel__source-warning" role="status">路线来源与评分状态待确认</p>}
      {routes.map((route) => {
        const isSelected = route.id === selectedRouteId;
        const score = route.stressScore;
        const environmentIndex = route.stressExposure;
        const showScore = routeSource === "real" && scoringStatus === "valid"
          && isValidScore(environmentIndex) && isValidScore(score)
          && Number.isFinite(route.confidence) && route.confidence >= 0 && route.confidence <= 1
          && (route.scoringStatus === undefined || route.scoringStatus === "VALID");
        return (
          <button
            aria-label={`选择 ${route.label}`}
            aria-pressed={isSelected}
            className={`route-panel__card ${isSelected ? "route-panel__card--selected" : ""}`}
            key={route.id}
            onClick={() => onSelectRoute(route.id)}
            type="button"
          >
            <div className="route-panel__header">
              <span className="route-panel__label">{route.label}</span>
              <div className="route-panel__badges">
                {route.fastest && (
                  <span className="route-panel__badge route-panel__badge--fast">
                    最快
                  </span>
                )}
                {route.leastStressful && showScore && (
                  <span className="route-panel__badge route-panel__badge--calm">
                    少心累
                  </span>
                )}
              </div>
            </div>
            <div className="route-panel__stats">
              <div className="route-panel__stat">
                <span className="route-panel__stat-value">
                  {formatDistance(route.distanceMeters)}
                </span>
                <span className="route-panel__stat-label">距离</span>
              </div>
              <div className="route-panel__stat">
                <span className="route-panel__stat-value">
                  {formatDuration(route.durationSeconds)}
                </span>
                <span className="route-panel__stat-label">预计时间</span>
              </div>
              {showScore ? (
                <>
                  <div className="route-panel__stat">
                    <span className="route-panel__stat-value">{Math.round(environmentIndex)}</span>
                    <span className="route-panel__stat-label">环境指数</span>
                  </div>
                  <div className="route-panel__stat">
                    <span className="route-panel__stat-value">{Math.round(score)}</span>
                    <span className="route-panel__stat-label">综合评分</span>
                  </div>
                </>
              ) : (
                <div className="route-panel__stat">
                  <span className="route-panel__stat-value route-panel__stat-value--pending">—</span>
                  <span className="route-panel__stat-label">评分待确认</span>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
