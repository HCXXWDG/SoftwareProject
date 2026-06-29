import type { ScoredRoute } from "../../types";
import "./RoutePanel.css";

interface RoutePanelProps {
  routes: ScoredRoute[];
  selectedRouteId?: string;
  onSelectRoute: (routeId: string) => void;
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
}: RoutePanelProps) {
  if (!routes || routes.length === 0) {
    return null;
  }

  return (
    <div aria-label="路线对比" className="route-panel" data-testid="route-panel">
      {routes.map((route) => {
        const isSelected = route.id === selectedRouteId;
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
                {route.leastStressful && (
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
                  {Math.round(route.stressScore)}
                </span>
                <span className="route-panel__stat-label">压力</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
