import { useMemo, useState } from "react";
import type { HeatmapCell } from "../../types";
import type { ProjectedPoint } from "./viewport";
import { confidenceToOpacity, scoreToColor, scoreToGradient } from "./viewport";

interface HeatmapOverlayProps {
  cells: HeatmapCell[];
  project: (cell: HeatmapCell) => ProjectedPoint;
  viewportRevision: number;
}

/** 根据反馈数量动态调整热点尺寸：1 条 → 44px，20 条 → 96px */
function heatSize(count: number): number {
  return Math.min(44 + count * 3.6, 96);
}

export function HeatmapOverlay({
  cells,
  project,
  viewportRevision,
}: HeatmapOverlayProps) {
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const projectedCells = useMemo(
    () => cells.map((cell) => ({
      cell,
      point: project(cell),
      size: heatSize(cell.count),
    })),
    [cells, project, viewportRevision],
  );
  const selected = projectedCells.find(({ cell }) => cell.cellId === selectedCellId);

  return (
    <div className="map-surface__heatmap" data-testid="heatmap-overlay">
      {projectedCells.map(({ cell, point, size }) => {
        const { inner, outer } = scoreToGradient(cell.score);
        const opacity = confidenceToOpacity(cell.confidence);
        const glow = scoreToColor(cell.score).replace("rgb(", "rgba(").replace(")", ", 0.45)");
        return (
          <button
            aria-label={`热力点 压力${Math.round(cell.score)} ${cell.dominantTag}`}
            className="map-surface__heat-point"
            data-cell-id={cell.cellId}
            data-testid="heatmap-point"
            key={cell.cellId}
            onClick={() => setSelectedCellId(cell.cellId)}
            style={{
              left: `${point.x}px`,
              top: `${point.y}px`,
              width: `${size}px`,
              height: `${size}px`,
              opacity,
              background: `radial-gradient(circle at 50% 50%, ${inner}, ${glow} 35%, ${outer} 65%, transparent 100%)`,
            }}
            type="button"
          />
        );
      })}

      {selected && (
        <div
          aria-live="polite"
          className="map-surface__cell-details"
          data-testid="heatmap-cell-details"
          role="status"
          style={{
            left: `${selected.point.x}px`,
            top: `${selected.point.y}px`,
          }}
        >
          <span
            className="map-surface__cell-details-dot"
            style={{ backgroundColor: scoreToColor(selected.cell.score) }}
          />
          <div className="map-surface__cell-details-body">
            <strong>{selected.cell.dominantTag}</strong>
            <span>压力 {Math.round(selected.cell.score)}</span>
            <span>置信度 {Math.round(selected.cell.confidence * 100)}%</span>
            <span>{selected.cell.count} 条反馈</span>
          </div>
        </div>
      )}
    </div>
  );
}
