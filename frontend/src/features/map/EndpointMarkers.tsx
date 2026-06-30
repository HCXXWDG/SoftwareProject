import type { GeoPoint } from "../../types";
import type { ProjectedPoint } from "./viewport";

export interface EndpointMarker {
  id: string;
  point: GeoPoint;
  label: string;
  role: "origin" | "destination";
}

interface EndpointMarkersProps {
  origin?: GeoPoint;
  destination?: GeoPoint;
  project: (point: GeoPoint) => ProjectedPoint;
  viewportRevision: number;
}

export function EndpointMarkers({
  origin,
  destination,
  project,
  viewportRevision,
}: EndpointMarkersProps) {
  const markers: EndpointMarker[] = [];
  if (origin) {
    markers.push({
      id: "endpoint-origin",
      point: origin,
      label: "起点",
      role: "origin",
    });
  }
  if (destination) {
    markers.push({
      id: "endpoint-destination",
      point: destination,
      label: "终点",
      role: "destination",
    });
  }

  if (markers.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="固定端点标记"
      className="map-surface__endpoint-markers"
      data-testid="endpoint-markers"
      data-viewport-revision={viewportRevision}
    >
      {markers.map((marker) => {
        const { x, y } = project(marker.point);
        return (
          <div
            aria-label={marker.label}
            className={`map-surface__endpoint map-surface__endpoint--${marker.role}`}
            data-testid={marker.id}
            key={marker.id}
            style={{ left: `${x}px`, top: `${y}px` }}
          >
            <span className="map-surface__endpoint-pin" />
            <span className="map-surface__endpoint-label">{marker.label}</span>
          </div>
        );
      })}
    </div>
  );
}