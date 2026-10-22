import { api, ApiError } from "./api";
import type { GeoPoint } from "../types";

/** A history entry is a source of endpoints only; its cached result is never reused. */
export interface RouteQueryHistory {
  id: string;
  origin: GeoPoint;
  destination: GeoPoint;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPoint(value: unknown): value is GeoPoint {
  return isRecord(value)
    && typeof value.longitude === "number" && Number.isFinite(value.longitude)
    && typeof value.latitude === "number" && Number.isFinite(value.latitude)
    && Math.abs(value.longitude) <= 180 && Math.abs(value.latitude) <= 90;
}

/** Read only fields used for replanning, including responses written by older servers. */
export async function fetchRouteHistory(
  limit: number = 10,
  signal?: AbortSignal,
): Promise<RouteQueryHistory[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("查询历史条数必须为 1 到 50 的整数");
  }
  const result = await api.get<unknown>(`/api/v1/routes/history?limit=${limit}`, signal);
  if (!Array.isArray(result)) {
    throw new ApiError("format", "服务器返回的查询历史格式不正确");
  }
  return result.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim()
      || !isPoint(entry.origin) || !isPoint(entry.destination)
      || typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt))) {
      throw new ApiError("format", "服务器返回的查询历史格式不正确");
    }
    return {
      id: entry.id,
      origin: { longitude: entry.origin.longitude, latitude: entry.origin.latitude },
      destination: { longitude: entry.destination.longitude, latitude: entry.destination.latitude },
      createdAt: entry.createdAt,
    };
  });
}
