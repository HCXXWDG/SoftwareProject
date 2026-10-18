import type { BackendStatus, BaseMapMode, RouteComparison } from "../types";

/** 底图离线与 API 离线分别判断；缺少来源信息时不认定真实评分。 */
export function tripCapabilities(comparison: RouteComparison | null, backend: BackendStatus, baseMap: BaseMapMode) {
  const showScores = comparison?.routeSource === "REAL"
    && comparison.feedbackSource === "REAL" && comparison.scoringStatus === "VALID";
  return {
    baseMap, canRefresh: backend !== "unavailable", canReport: backend === "available", showScores,
    // D01/D02 尚未提供快照和幂等协议，禁止旧客户端评分写入。
    canComplete: false,
    completeReason: comparison?.routeSource === "DEMO" ? "演示路线不能记录为真实通勤。"
      : "当前路线暂不支持记录通勤，可继续查看路线和历史趋势。",
  };
}

export function routeSourceLabel(comparison: RouteComparison): string {
  if (comparison.routeSource === "DEMO") return "演示路线 · 评分不可用";
  if (comparison.routeSource === "REAL") return comparison.scoringStatus === "VALID" && comparison.feedbackSource === "REAL"
    ? "真实路线 · 评分有效" : "真实路线 · 暂无有效评分";
  return "路线来源与评分状态待确认";
}

export function formatDuration(seconds: number): string {
  return seconds < 60 ? "不足一分钟" : `${Math.round(seconds / 60)} 分钟`;
}
