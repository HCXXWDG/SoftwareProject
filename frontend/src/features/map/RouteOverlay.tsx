import { useMemo } from "react";
import type { GeoPoint, ScoredRoute } from "../../types";
import type { ProjectedPoint } from "./viewport";

interface RouteOverlayProps {
  routes: ScoredRoute[];
  selectedRouteId?: string;
  project: (point: GeoPoint) => ProjectedPoint;
  viewportRevision: number;
  onRouteSelect?: (routeId: string) => void;
}

export function RouteOverlay({
  routes,
  selectedRouteId,
  project,
  viewportRevision,
  onRouteSelect,
}: RouteOverlayProps) {
  if (routes.length === 0) {
    return null;
  }

  const projectedRoutes = useMemo(
    () =>
      routes.map((route) => ({
        route,
        points: route.polyline.map((geo) => project(geo)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routes, project, viewportRevision],
  );

  const toPointsAttr = (points: ProjectedPoint[]) =>
    points.map((p) => `${p.x},${p.y}`).join(" ");

  // Render non-selected routes first, selected on top
  const sorted = [...projectedRoutes].sort((a, b) => {
    const aSelected = a.route.id === selectedRouteId ? 1 : 0;
    const bSelected = b.route.id === selectedRouteId ? 1 : 0;
    return aSelected - bSelected;
  });

  return (
    <svg
      aria-label="路线叠加层"
      className="map-surface__route-overlay"
      data-testid="route-overlay"
    >
      {sorted.map(({ route, points }) => {
        const isSelected = route.id === selectedRouteId;
        return (
          <polyline
            className={`map-surface__route-line ${isSelected ? "map-surface__route-line--selected" : ""}`}
            data-route-id={route.id}
            fill="none"
            key={route.id}
            onClick={() => onRouteSelect?.(route.id)}
            points={toPointsAttr(points)}
            stroke={isSelected ? "#2368ff" : "#a0b4c0"}
            strokeDasharray={isSelected ? "none" : "8 4"}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={isSelected ? 1 : 0.6}
            strokeWidth={isSelected ? 4 : 3}
            style={{ cursor: onRouteSelect ? "pointer" : undefined }}
          />
        );
      })}
    </svg>
  );
}
