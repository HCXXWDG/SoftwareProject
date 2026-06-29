import type { ScoredRoute } from "../../types";

interface RouteLegendProps {
  routes: ScoredRoute[];
  selectedRouteId?: string;
}

export function RouteLegend({ routes, selectedRouteId }: RouteLegendProps) {
  if (routes.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="路线图例"
      className="map-surface__route-legend"
      data-testid="route-legend"
    >
      {routes.map((route) => {
        const isSelected = route.id === selectedRouteId;
        return (
          <div
            className={`map-surface__route-legend-item ${isSelected ? "map-surface__route-legend-item--selected" : ""}`}
            key={route.id}
          >
            <svg height="12" width="28">
              <line
                stroke={isSelected ? "#2368ff" : "#a0b4c0"}
                strokeDasharray={isSelected ? "none" : "6 3"}
                strokeLinecap="round"
                strokeWidth={isSelected ? 3 : 2}
                x1="0"
                x2="28"
                y1="6"
                y2="6"
              />
            </svg>
            <span>{route.label}</span>
          </div>
        );
      })}
    </div>
  );
}
