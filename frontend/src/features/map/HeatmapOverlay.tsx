import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { EmotionTag, FeedbackSource, HeatmapCell } from "../../types";
import type { ProjectedPoint } from "./viewport";
import { confidenceToOpacity, scoreToColor, scoreToGradient } from "./viewport";
import "./HeatmapOverlay.css";

interface HeatmapOverlayProps {
  cells: HeatmapCell[];
  project: (cell: HeatmapCell) => ProjectedPoint;
  viewportRevision: number;
  interactionEnabled?: boolean;
}

/** 根据反馈数量动态调整热点尺寸：1 条 → 44px，20 条 → 96px */
function heatSize(count: number): number {
  return Math.min(44 + count * 3.6, 96);
}

const TAG_LABELS: Record<EmotionTag, string> = {
  NOISE: "噪音", CROWD: "拥挤", SUN: "暴晒", ODOR: "异味",
  QUIET: "安静", SHADE: "树荫", OPEN: "开阔", OTHER: "其他",
};
const SOURCE_LABELS: Record<FeedbackSource, string> = {
  REAL: "真实反馈", DEMO: "演示反馈", MIXED: "混合反馈", NONE: "暂无反馈", UNKNOWN: "未确认",
};

function tagLabel(tag: string): string {
  return Object.prototype.hasOwnProperty.call(TAG_LABELS, tag) ? TAG_LABELS[tag as EmotionTag] : "其他";
}

function sourceLabel(source: HeatmapCell["feedbackSource"]): string {
  return source && Object.prototype.hasOwnProperty.call(SOURCE_LABELS, source) ? SOURCE_LABELS[source] : "未确认";
}

function updatedLabel(value: HeatmapCell["updatedAt"]): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "未提供";
  return `${new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）`;
}

export function HeatmapOverlay({
  cells,
  project,
  viewportRevision,
  interactionEnabled = true,
}: HeatmapOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const selectedButtonRef = useRef<HTMLButtonElement | null>(null);
  const gesture = useRef<{ cellId: string; pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const [pressedCellId, setPressedCellId] = useState<string | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const detailsId = useId();
  const [detailsPosition, setDetailsPosition] = useState<ProjectedPoint | null>(null);
  const projectedCells = useMemo(
    () => cells.map((cell) => ({
      cell,
      point: project(cell),
      size: heatSize(cell.count),
    })),
    [cells, project, viewportRevision],
  );
  const selected = projectedCells.find(({ cell }) => cell.cellId === selectedCellId);
  // Keep the full heat field, but prevent 44px buttons from covering each other
  // in the district overview. A selected cell keeps its own identity on zoom.
  const interactiveCellIds = useMemo(() => {
    const accepted: typeof projectedCells = [];
    const ordered = [...projectedCells].sort((a, b) =>
      Number(b.cell.cellId === selectedCellId) - Number(a.cell.cellId === selectedCellId)
      || a.cell.cellId.localeCompare(b.cell.cellId));
    for (const candidate of ordered) {
      if (!accepted.some(({ point }) => Math.abs(point.x - candidate.point.x) < 48
        && Math.abs(point.y - candidate.point.y) < 48)) accepted.push(candidate);
    }
    return new Set(accepted.map(({ cell }) => cell.cellId));
  }, [projectedCells, selectedCellId]);
  const detailsVisible = !!selected && interactionEnabled && detailsPosition !== null;

  const closeDetails = useCallback(() => {
    setSelectedCellId(null);
    selectedButtonRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    // Observe the gesture without capturing or cancelling it: the map can still handle bubbling pointer events.
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) {
        current.moved = true;
        setPressedCellId(null);
      }
    };
    const end = (event: PointerEvent) => {
      if (gesture.current?.pointerId !== event.pointerId) return;
      move(event);
      if (event.type === "pointercancel" && gesture.current) gesture.current.moved = true;
      setPressedCellId(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  useEffect(() => {
    if (selectedCellId && (!selected || !interactionEnabled)) setSelectedCellId(null);
    if (!interactionEnabled) { setPressedCellId(null); gesture.current = null; }
  }, [selected, selectedCellId, interactionEnabled]);

  useEffect(() => {
    if (detailsVisible) closeRef.current?.focus({ preventScroll: true });
  }, [selectedCellId, detailsVisible]);

  useLayoutEffect(() => {
    if (!selected) { setDetailsPosition(null); return; }
    const overlay = overlayRef.current;
    const details = detailsRef.current;
    if (!overlay || !details) return;
    const positionDetails = () => {
      const container = overlay.getBoundingClientRect();
      const measured = details.getBoundingClientRect();
      const padding = 8;
      const gap = 16;
      // Measure the actual, CSS-constrained dialog; metadata and text wrapping change its size.
      const preferredX = selected.point.x + gap + measured.width <= container.width - padding
        ? selected.point.x + gap : selected.point.x - measured.width - gap;
      const preferredY = selected.point.y - measured.height - gap >= padding
        ? selected.point.y - measured.height - gap : selected.point.y + gap;
      const clamp = (value: number, available: number) => Math.max(0, Math.min(Math.max(padding, value), available - padding));
      const next = { x: clamp(preferredX, container.width - measured.width),
        y: clamp(preferredY, container.height - measured.height) };
      setDetailsPosition(current => current?.x === next.x && current.y === next.y ? current : next);
    };
    positionDetails();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(positionDetails);
    observer?.observe(overlay);
    observer?.observe(details);
    window.addEventListener("resize", positionDetails);
    return () => { observer?.disconnect(); window.removeEventListener("resize", positionDetails); };
  }, [selected, viewportRevision]);

  return (
    <div className={`map-surface__heatmap${selected && interactionEnabled ? " map-surface__heatmap--details-open" : ""}`}
      data-testid="heatmap-overlay" ref={overlayRef}
      onKeyDown={event => {
        if (selected && event.key === "Escape") { event.stopPropagation(); closeDetails(); }
      }}>
      {projectedCells.map(({ cell, point, size }) => {
        const { inner, outer } = scoreToGradient(cell.score);
        const opacity = confidenceToOpacity(cell.confidence);
        const glow = scoreToColor(cell.score).replace("rgb(", "rgba(").replace(")", ", 0.45)");
        const haloStyle = {
          width: `${size * 1.3}px`, height: `${size * 1.3}px`, opacity,
          background: `radial-gradient(circle at 50% 50%, ${inner}, ${glow} 35%, ${outer} 65%, transparent 100%)`,
        };
        if (!interactiveCellIds.has(cell.cellId)) return <span key={cell.cellId} aria-hidden="true"
          className="heatmap-point__halo heatmap-point__halo--passive" data-testid="heatmap-point-halo"
          data-cell-id={cell.cellId} style={{ ...haloStyle, left: `${point.x}px`, top: `${point.y}px` }} />;
        return (
          <button
            aria-label={`热力点 压力${Math.round(cell.score)} ${cell.dominantTag}`}
            className="map-surface__heat-point"
            data-cell-id={cell.cellId}
            data-testid="heatmap-point"
            data-pressed={pressedCellId === cell.cellId ? "true" : undefined}
            aria-pressed={selectedCellId === cell.cellId}
            aria-expanded={selectedCellId === cell.cellId}
            aria-haspopup="dialog"
            aria-controls={selectedCellId === cell.cellId ? detailsId : undefined}
            key={cell.cellId}
            disabled={!interactionEnabled}
            onPointerDown={event => {
              if (event.button !== 0) return;
              gesture.current = { cellId: cell.cellId, pointerId: event.pointerId,
                x: event.clientX, y: event.clientY, moved: false };
              setPressedCellId(cell.cellId);
            }}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") setPressedCellId(cell.cellId);
            }}
            onKeyUp={() => setPressedCellId(null)}
            onBlur={() => setPressedCellId(null)}
            onClick={event => {
              const dragged = event.detail > 0 && gesture.current?.cellId === cell.cellId && gesture.current.moved;
              gesture.current = null;
              setPressedCellId(null);
              if (dragged) return;
              selectedButtonRef.current = event.currentTarget;
              setSelectedCellId(cell.cellId);
            }}
            style={{
              left: `${point.x}px`,
              top: `${point.y}px`,
              width: "44px",
              height: "44px",
              "--heatmap-color": inner,
            } as CSSProperties}
            type="button"
          >
            <span aria-hidden="true" className="heatmap-point__halo" data-testid="heatmap-point-halo" style={haloStyle} />
            <span aria-hidden="true" className="heatmap-point__center" />
            <span aria-hidden="true" className="heatmap-point__selection" />
          </button>
        );
      })}

      {interactiveCellIds.size < projectedCells.length && <p className="heatmap-density-hint">放大地图可查看更细的热力点</p>}

      {selected && interactionEnabled && (
        <div
          aria-label="热力点详情"
          className="map-surface__cell-details"
          data-testid="heatmap-cell-details"
          data-cell-id={selected.cell.cellId}
          id={detailsId}
          ref={detailsRef}
          role="dialog"
          onPointerDown={event => event.stopPropagation()}
          style={{
            left: `${detailsPosition?.x ?? 0}px`,
            top: `${detailsPosition?.y ?? 0}px`,
            visibility: detailsPosition ? "visible" : "hidden",
          }}
        >
          <span
            className="map-surface__cell-details-dot"
            style={{ backgroundColor: scoreToColor(selected.cell.score) }}
          />
          <div className="map-surface__cell-details-body">
            <span className="heatmap-details__selected">已选热力点</span>
            <span className="heatmap-details__scope">以下为此单元格数据</span>
            <strong>{tagLabel(selected.cell.dominantTag)}</strong>
            <span>压力 {Math.round(selected.cell.score)}</span>
            <span>置信度 {Math.round(selected.cell.confidence * 100)}%</span>
            <span>{selected.cell.count} 条反馈</span>
            <span>来源：{sourceLabel(selected.cell.feedbackSource)}</span>
            <span>更新时间：{updatedLabel(selected.cell.updatedAt)}</span>
            <span>统计窗口：{selected.cell.windowHours != null && Number.isInteger(selected.cell.windowHours) && selected.cell.windowHours > 0
              ? `${selected.cell.windowHours} 小时` : "未提供"}</span>
          </div>
          <button aria-label="关闭热力点详情" className="map-surface__cell-details-close" ref={closeRef}
            onClick={closeDetails} type="button">关闭</button>
        </div>
      )}
    </div>
  );
}
