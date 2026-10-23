import { useMemo } from "react";
import { SERVICE_AREA, SERVICE_VIEWPORT_CONSTRAINT } from "../../config/serviceArea";
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
  const constraint = useMemo(() => ({ ...SERVICE_VIEWPORT_CONSTRAINT, center: initialPoint, defaultZoom: SERVICE_AREA.pickerZoom }),
    [initialPoint.longitude, initialPoint.latitude]);
  return <section className="campus-picker" role="dialog" aria-label={`地图选择${target}`}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
    <header className="campus-picker__header">
      <button type="button" onClick={onCancel} autoFocus>取消选点</button>
      <h2>地图选择{target}</h2>
      <p>拖动地图，将中心准星对准梁溪区地图范围内的位置，再确认。可缩小地图选择更远的位置。</p>
    </header>
    <div className="campus-picker__map">
      <MapSurface heatmapCells={noCells} routes={noRoutes} loading={false}
        onFeedbackSubmit={noFeedback} onRouteSelect={ignore} onViewportChange={ignore}
        feedbackEnabled={false} viewportConstraint={constraint}
        pointSelection={{ label: `使用此位置作为${target}`, onSelect }} />
    </div>
  </section>;
}
