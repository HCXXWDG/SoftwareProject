import { useMemo } from "react";
import { CAMPUS_VIEWPORT_CONSTRAINT } from "../../config/campus";
import type { GeoPoint } from "../../types";
import { MapSurface } from "./MapSurface";
import "./CampusPointPicker.css";

const ignore = () => {};
const noFeedback = async () => {};
const noRoutes: [] = [];
const noCells: [] = [];

export function CampusPointPicker({ target, initialPoint, onSelect, onCancel }: {
  target: "起点" | "终点";
  initialPoint: GeoPoint;
  onSelect: (point: GeoPoint) => void;
  onCancel: () => void;
}) {
  const constraint = useMemo(() => ({ ...CAMPUS_VIEWPORT_CONSTRAINT, center: initialPoint }),
    [initialPoint.longitude, initialPoint.latitude]);
  return <section className="campus-picker" role="dialog" aria-label={`地图选择${target}`}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
    <header className="campus-picker__header">
      <button type="button" onClick={onCancel} autoFocus>取消选点</button>
      <h2>地图选择{target}</h2>
      <p>拖动地图，将中心准星对准校区内想去的位置，再确认。原有地点可作为快捷选择。</p>
    </header>
    <div className="campus-picker__map">
      <MapSurface heatmapCells={noCells} routes={noRoutes} loading={false}
        onFeedbackSubmit={noFeedback} onRouteSelect={ignore} onViewportChange={ignore}
        feedbackEnabled={false} viewportConstraint={constraint}
        pointSelection={{ label: `使用此位置作为${target}`, onSelect }} />
    </div>
  </section>;
}
