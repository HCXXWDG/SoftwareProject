import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_DESTINATION, DEFAULT_ORIGIN } from "../config/campus";
import type { AppStage, GeoPoint } from "../types";

export interface TripSelection { origin: GeoPoint; destination: GeoPoint; originName: string; destName: string; }
type Navigation = { stage: AppStage; selection: TripSelection };
const KEY = "commute-trip-v1";
const defaults: Navigation = { stage: "welcome", selection: {
  origin: DEFAULT_ORIGIN.point, destination: DEFAULT_DESTINATION.point,
  originName: DEFAULT_ORIGIN.name, destName: DEFAULT_DESTINATION.name,
} };
function lightweight(trip: TripSelection): TripSelection {
  return {
    origin: { longitude: trip.origin.longitude, latitude: trip.origin.latitude },
    destination: { longitude: trip.destination.longitude, latitude: trip.destination.latitude },
    originName: trip.originName, destName: trip.destName,
  };
}
function validPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== "object") return false;
  const p = value as GeoPoint;
  return Number.isFinite(p.longitude) && Number.isFinite(p.latitude)
    && Math.abs(p.longitude) <= 180 && Math.abs(p.latitude) <= 90;
}
function read(value: unknown): Navigation | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as { version?: unknown; stage?: unknown; selection?: TripSelection };
  const trip = saved.selection;
  if (saved.version !== 1 || !trip || !validPoint(trip.origin) || !validPoint(trip.destination)
    || typeof trip.originName !== "string" || typeof trip.destName !== "string"
    || !trip.originName.trim() || !trip.destName.trim() || trip.originName.length > 80 || trip.destName.length > 80
    || !["welcome", "route-preview", "map"].includes(String(saved.stage))) return null;
  // 只恢复轻量端点；地图结果和评分必须重新查询。
  return { selection: lightweight(trip), stage: saved.stage === "welcome" ? "welcome" : "route-preview" };
}
function restore(): Navigation {
  try { return read(JSON.parse(localStorage.getItem(KEY) ?? "null")) ?? defaults; } catch { return defaults; }
}
function save(nav: Navigation) {
  try { localStorage.setItem(KEY, JSON.stringify({ version: 1, stage: nav.stage, selection: lightweight(nav.selection) })); } catch { /* 会话中仍可导航 */ }
}

export function useTripNavigation() {
  const [navigation, setNavigation] = useState(restore);
  const current = useRef(navigation);
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, commuteTrip: { version: 1, ...navigation } }, "", `#${navigation.stage}`);
    const pop = (event: PopStateEvent) => {
      const next = read(event.state?.commuteTrip) ?? { ...current.current, stage: "welcome" as const };
      current.current = next; save(next); setNavigation(next);
      window.history.replaceState({ ...window.history.state, commuteTrip: { version: 1, ...next } }, "", `#${next.stage}`);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
    // 安装一次浏览器历史监听；每次导航的端点都保存在 history state 中。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const navigate = useCallback((stage: AppStage, selection?: TripSelection) => {
    const next = { stage, selection: lightweight(selection ?? current.current.selection) };
    current.current = next; save(next);
    window.history.pushState({ ...window.history.state, commuteTrip: { version: 1, ...next } }, "", `#${stage}`);
    setNavigation(next);
  }, []);
  return { ...navigation, navigate };
}
