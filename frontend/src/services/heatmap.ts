import { api } from "./api";
import type { HeatmapCell } from "../types";

/** 获取热力图数据 */
export async function fetchHeatmap(
  bbox: string,
  zoom: number = 16,
  hours: number = 168
): Promise<HeatmapCell[]> {
  const params = new URLSearchParams({ bbox, zoom: String(zoom), hours: String(hours) });
  return api.get<HeatmapCell[]>(`/api/v1/heatmap?${params}`);
}
