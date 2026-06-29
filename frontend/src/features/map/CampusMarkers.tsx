import { CAMPUS } from "../../config/campus";
import type { GeoPoint } from "../../types";
import type { ProjectedPoint } from "./viewport";

interface CampusMarkersProps {
  project: (point: GeoPoint) => ProjectedPoint;
  viewportRevision: number;
}

/**
 * 固定起终点标记组件。
 * 在地图上渲染起点（学生公寓区，绿色）和终点（第一教学楼，红色）标记。
 */
export function CampusMarkers({ project, viewportRevision }: CampusMarkersProps) {
  const originProjected = project(CAMPUS.origin);
  const destinationProjected = project(CAMPUS.destination);

  return (
    <>
      {/* 起点标记 — 学生公寓区 */}
      <div
        className="map-surface__campus-marker map-surface__campus-marker--origin"
        data-viewport-revision={viewportRevision}
        style={{
          left: originProjected.x,
          top: originProjected.y,
        }}
        title="起点：学生公寓区"
      >
        <span className="map-surface__campus-marker-dot map-surface__campus-marker-dot--origin" />
        <span className="map-surface__campus-marker-label">学生公寓区</span>
      </div>

      {/* 终点标记 — 第一教学楼 */}
      <div
        className="map-surface__campus-marker map-surface__campus-marker--destination"
        data-viewport-revision={viewportRevision}
        style={{
          left: destinationProjected.x,
          top: destinationProjected.y,
        }}
        title="终点：第一教学楼"
      >
        <span className="map-surface__campus-marker-dot map-surface__campus-marker-dot--destination" />
        <span className="map-surface__campus-marker-label">第一教学楼</span>
      </div>
    </>
  );
}
