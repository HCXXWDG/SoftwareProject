import { useCallback, useEffect, useRef, useState } from "react";
import { CAMPUS_DEFAULT_BBOX } from "../config/campus";
import { ApiError, isRequestCancelled } from "../services/api";
import { fetchHeatmap } from "../services/heatmap";
import type { BackendStatus, HeatmapCell } from "../types";

export type HeatmapRefreshResult = "success" | "failed" | "cancelled";

/** 最近视口在防抖前保存；写入成功后刷新它，不重复写入。 */
export function useHeatmapQuery(enabled: boolean, onBackend: (status: BackendStatus) => void) {
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewport = useRef({ bbox: CAMPUS_DEFAULT_BBOX, zoom: 16 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const active = useRef(enabled); active.current = enabled;
  const backend = useRef(onBackend); backend.current = onBackend;
  const version = useRef(0);
  const refresh = useCallback(async (): Promise<HeatmapRefreshResult> => {
    if (!active.current) return "cancelled";
    clearTimeout(timer.current);
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const revision = ++version.current;
    setLoading(true); setError(null);
    try {
      const next = await fetchHeatmap(viewport.current.bbox, viewport.current.zoom, 168, abort.signal);
      if (abort.signal.aborted || revision !== version.current || !active.current) return "cancelled";
      setCells(next); backend.current("available"); return "success";
    } catch (failure) {
      if (abort.signal.aborted || revision !== version.current || isRequestCancelled(failure)) return "cancelled";
      setError(failure instanceof Error ? failure.message : "热力图加载失败，请重试。");
      backend.current(failure instanceof ApiError && ["network", "timeout"].includes(failure.kind) ? "unavailable" : "unknown");
      return "failed";
    } finally { if (revision === version.current && !abort.signal.aborted) setLoading(false); }
  }, []);
  const updateViewport = useCallback((bbox: string, zoom: number) => {
    const bounds = bbox.split(",").map(Number);
    if (bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]
      || !Number.isFinite(zoom)) return;
    const previousBounds = viewport.current.bbox.split(",").map(Number);
    if (zoom === viewport.current.zoom && bounds.every((value, index) => value === previousBounds[index])) return;
    viewport.current = { bbox, zoom };
    clearTimeout(timer.current);
    // The old response is obsolete as soon as the viewport changes, including during debounce.
    ++version.current;
    controller.current?.abort();
    controller.current = undefined;
    if (active.current) {
      setLoading(true); setError(null);
      timer.current = setTimeout(() => { void refresh(); }, 300);
    }
  }, [refresh]);
  useEffect(() => {
    if (enabled) void refresh();
    else { setCells([]); setError(null); setLoading(false); }
    return () => { clearTimeout(timer.current); controller.current?.abort(); ++version.current; };
  }, [enabled, refresh]);
  return { cells, loading, error, refresh, updateViewport };
}
