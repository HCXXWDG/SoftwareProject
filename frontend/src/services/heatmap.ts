import { api } from "./api";
import type { HeatmapCell } from "../types";
import { isHeatmapCells } from "./responseValidators";

/** 热力图展示口径独立于路线评分和通勤统计，不混合真实与模拟反馈。 */
export type HeatmapScope = "REAL_ONLY" | "SIMULATED_ONLY";

/** 获取热力图数据 */
export async function fetchHeatmap(
  bbox: string,
  zoom: number = 16,
  hours: number = 168,
  signal?: AbortSignal,
  scope: HeatmapScope = "REAL_ONLY",
): Promise<HeatmapCell[]> {
  const params = new URLSearchParams({ bbox, zoom: String(zoom), hours: String(hours), scope });
  return api.get<HeatmapCell[]>(`/api/v1/heatmap?${params}`, signal, isHeatmapCells);
}
