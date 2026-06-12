import { useMemo, useState } from "react";
import type { HeatmapCell } from "../../types";
import type { ProjectedPoint } from "./viewport";
import { confidenceToOpacity, scoreToColor } from "./viewport";

interface HeatmapOverlayProps {
  cells: HeatmapCell[];
  project: (cell: HeatmapCell) => ProjectedPoint;
  viewportRevision: number;
}

export function HeatmapOverlay({
  cells,
  project,
  viewportRevision,
}: HeatmapOverlayProps) {
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const projectedCells = useMemo(
    () => cells.map((cell) => ({ cell, point: project(cell) })),
    [cells, project, viewportRevision],
  );
  const selected = projectedCells.find(({ cell }) => cell.cellId === selectedCellId);

  return (
    <div className="map-surface__heatmap" data-testid="heatmap-overlay">
      {projectedCells.map(({ cell, point }) => (
        <button
          aria-label={`查看热力点 ${cell.cellId}`}
          className="map-surface__heat-point"
          data-cell-id={cell.cellId}
          data-testid="heatmap-point"
          key={cell.cellId}
          onClick={() => setSelectedCellId(cell.cellId)}
          style={{
            backgroundColor: scoreToColor(cell.score),
            left: `${point.x}px`,
            opacity: confidenceToOpacity(cell.confidence),
            top: `${point.y}px`,
          }}
          type="button"
        />
      ))}

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
          <strong>{selected.cell.dominantTag}</strong>
          <span>压力 {Math.round(selected.cell.score)}</span>
          <span>置信度 {Math.round(selected.cell.confidence * 100)}%</span>
          <span>{selected.cell.count} 条反馈</span>
        </div>
      )}
    </div>
  );
}
