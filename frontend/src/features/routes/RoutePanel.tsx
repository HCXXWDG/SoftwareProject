import type { ScoredRoute } from "../../types";
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

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} 分钟`;
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
      {routeSource === "unknown" && <p role="status">路线来源与评分状态待确认</p>}
      {routes.map((route) => {
        const isSelected = route.id === selectedRouteId;
        const score = route.stressScore;
        const showScore = routeSource === "real" && scoringStatus === "valid"
          && isValidScore(route.stressExposure) && isValidScore(score);
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
                <span className="route-panel__stat-label">时间</span>
              </div>
              <div className="route-panel__stat">
                <span className="route-panel__stat-value">
                  {showScore ? Math.round(score) : "—"}
                </span>
                <span className="route-panel__stat-label">{showScore ? "综合评分" : "评分待确认"}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
