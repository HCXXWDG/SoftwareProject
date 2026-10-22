import type { BackendStatus, BaseMapMode, RouteComparison } from "../types";

/** Enable only against an accepted D07 server; older deployments reject unscored writes. */
export function isCommuteRecordingEnabled(): boolean {
  return import.meta.env.VITE_COMMUTE_RECORDING_ENABLED === "true";
}

/** 底图离线与 API 离线分别判断；缺少来源信息时不认定真实评分。 */
export function tripCapabilities(comparison: RouteComparison | null, backend: BackendStatus, baseMap: BaseMapMode,
  recordingEnabled = isCommuteRecordingEnabled()) {
  const showScores = comparison?.routeSource === "REAL"
    && comparison.feedbackSource === "REAL" && comparison.scoringStatus === "VALID"
    && comparison.routes.length > 0 && comparison.routes.every((route) =>
      route.stressExposure != null && Number.isFinite(route.stressExposure) && route.stressExposure >= 0 && route.stressExposure <= 100
      && route.stressScore != null && Number.isFinite(route.stressScore) && route.stressScore >= 0 && route.stressScore <= 100
      && Number.isFinite(route.confidence) && route.confidence >= 0 && route.confidence <= 1
      && (route.scoringStatus === undefined || route.scoringStatus === "VALID"));
  const hasSnapshot = typeof comparison?.snapshotId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(comparison.snapshotId);
  const recordable = hasSnapshot && comparison!.routes.length > 0
    && ["REAL", "DEMO", "UNKNOWN"].includes(comparison!.routeSource ?? "");
  return {
    baseMap, canRefresh: backend !== "unavailable", canReport: backend === "available", showScores,
    canComplete: recordingEnabled && backend === "available" && recordable,
    completeReason: !recordingEnabled
      ? comparison?.routeSource === "DEMO" ? "演示通勤记录尚待接口联调，不会计入真实趋势。"
        : "当前路线暂不支持记录通勤，可继续查看路线和历史趋势。"
      : backend !== "available" ? "数据服务暂不可用，请恢复连接后再记录通勤。"
        : !recordable ? "当前路线暂时无法记录，请重新规划。"
          : comparison?.routeSource === "DEMO" ? "演示通勤可以保存，但不会计入真实趋势或通勤历史。"
            : "到达后选择本次感受，再完成通勤。没有路线评分也可以记录。",
  };
}

export function routeSourceLabel(comparison: RouteComparison): string {
  if (comparison.routeSource === "DEMO") return "演示路线 · 评分不可用";
  if (comparison.routeSource === "REAL") return tripCapabilities(comparison, "unknown", "loading").showScores
    ? "真实路线 · 评分有效" : "真实路线 · 暂无有效评分";
  return "路线来源与评分状态待确认";
}

/** C01 presentation enums differ from the B transport enums; only trusted scores become valid. */
export function routePanelPresentation(comparison: RouteComparison): {
  routeSource: "real" | "mock" | "unknown";
  scoringStatus: "valid" | "insufficient" | "none";
} {
  return {
    routeSource: comparison.routeSource === "REAL" ? "real" : comparison.routeSource === "DEMO" ? "mock" : "unknown",
    scoringStatus: tripCapabilities(comparison, "unknown", "loading").showScores ? "valid"
      : comparison.scoringStatus === "INSUFFICIENT_DATA" ? "insufficient" : "none",
  };
}

export function formatDuration(seconds: number): string {
  return seconds < 60 ? "不足一分钟" : `${Math.round(seconds / 60)} 分钟`;
}
