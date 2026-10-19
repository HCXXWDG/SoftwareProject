import type { CommuteRecord, GeoPoint, HeatmapCell, RouteComparison, ScoredRoute, TrendPoint, TrendResult } from "../types";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => number(value) && value >= 0;
const count = (value: unknown): value is number => nonnegative(value) && Number.isInteger(value);
const score = (value: unknown): value is number => number(value) && value >= 0 && value <= 100;
const confidence = (value: unknown): value is number => number(value) && value >= 0 && value <= 1;
// Jackson uses NON_NULL: a nullable backend field may be omitted from JSON altogether.
const optionalNullable = (value: unknown, check: (input: unknown) => boolean) => value === undefined || value === null || check(value);
const optionalEnum = (value: unknown, values: string[]) => value === undefined || (text(value) && values.includes(value));
const point = (value: unknown): value is GeoPoint => record(value)
  && number(value.longitude) && Math.abs(value.longitude) <= 180
  && number(value.latitude) && Math.abs(value.latitude) <= 90;
const timestamp = (value: unknown) => text(value) && value.length > 0 && Number.isFinite(Date.parse(value));

function scoredRoute(value: unknown): value is ScoredRoute {
  return record(value) && text(value.id) && value.id.length > 0 && text(value.label)
    && nonnegative(value.distanceMeters) && nonnegative(value.durationSeconds)
    && nonnegative(value.stressExposure) && score(value.stressScore) && confidence(value.confidence)
    && typeof value.fastest === "boolean" && typeof value.leastStressful === "boolean"
    && Array.isArray(value.polyline) && value.polyline.every(point);
}

/** Validate the actual backend record; future capability fields stay optional. */
export function isRouteComparison(value: unknown): value is RouteComparison {
  if (!record(value) || !Array.isArray(value.routes) || !value.routes.every(scoredRoute)
    || !text(value.fastestRouteId) || !text(value.leastStressfulRouteId)
    || !text(value.recommendation) || typeof value.recommendAlternative !== "boolean") return false;
  const ids = new Set(value.routes.map((route) => route.id));
  if (ids.size !== value.routes.length) return false;
  if (value.routes.length > 0 && (!ids.has(value.fastestRouteId) || !ids.has(value.leastStressfulRouteId))) return false;
  return optionalEnum(value.routeSource, ["REAL", "DEMO", "UNAVAILABLE"])
    && optionalEnum(value.feedbackSource, ["REAL", "DEMO", "NONE"])
    && optionalEnum(value.scoringStatus, ["VALID", "INSUFFICIENT_DATA", "UNAVAILABLE"])
    && (value.comparisonId === undefined || (text(value.comparisonId) && value.comparisonId.length > 0))
    && (value.recommendationReason === undefined || text(value.recommendationReason));
}

export function isHeatmapCells(value: unknown): value is HeatmapCell[] {
  return Array.isArray(value) && value.every((cell) => record(cell)
    && text(cell.cellId) && point(cell.center) && score(cell.score)
    && confidence(cell.confidence) && count(cell.count)
    && text(cell.dominantTag) && ["NOISE", "CROWD", "SUN", "ODOR", "QUIET", "SHADE", "OPEN", "OTHER"].includes(cell.dominantTag));
}

type AlternativeFields = "alternativeLabel" | "alternativeScore" | "alternativeDurationRatio";
export type CommuteRecordResponse = Omit<CommuteRecord, AlternativeFields> & Partial<Pick<CommuteRecord, AlternativeFields>>;

export function isCommuteRecord(value: unknown): value is CommuteRecordResponse {
  return record(value) && text(value.id) && value.id.length > 0 && text(value.deviceHash)
    && text(value.routeId) && text(value.routeLabel) && score(value.endStressLevel)
    && [0, 25, 50, 75, 100].includes(value.endStressLevel)
    && nonnegative(value.durationMinutes) && score(value.selectedScore) && score(value.fastestScore)
    && optionalNullable(value.alternativeLabel, text) && optionalNullable(value.alternativeScore, score)
    && optionalNullable(value.alternativeDurationRatio, nonnegative) && confidence(value.confidence)
    && timestamp(value.completedAt);
}

interface TrendSummaryResponse {
  averageStress?: number | null;
  stressDelta?: number | null;
  direction: "unknown" | "stable" | "improving" | "worsening";
  sampleSufficient: boolean;
}
export type TrendResultResponse = Omit<TrendResult, "points" | "summary"> & {
  points: (Omit<TrendPoint, "averageStress"> & { averageStress?: number | null })[];
  summary?: TrendSummaryResponse;
};

export function isTrendResult(value: unknown): value is TrendResultResponse {
  if (!record(value) || !text(value.recommendation) || !count(value.totalCommutes)
    || !Array.isArray(value.points) || !value.points.every((entry) => record(entry)
      && text(entry.date) && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      && optionalNullable(entry.averageStress, score) && count(entry.commuteCount))) return false;
  if (value.summary === undefined) return true;
  return record(value.summary) && optionalNullable(value.summary.averageStress, score)
    && optionalNullable(value.summary.stressDelta, number)
    && text(value.summary.direction) && ["unknown", "stable", "improving", "worsening"].includes(value.summary.direction)
    && typeof value.summary.sampleSufficient === "boolean";
}

export type ReportResponse = {
  status: "created";
  code?: "report_created";
  counted?: true;
  message: string;
} | {
  status: "duplicate";
  code?: "report_duplicate";
  counted?: false;
  message: string;
};

/** D04 result fields must agree; legacy bodies are accepted only at their original HTTP status. */
export function isReportResponse(value: unknown, status?: number): value is ReportResponse {
  if (!record(value) || !text(value.message) || value.success === false) return false;
  const legacy = value.code === undefined && value.counted === undefined;
  if (value.status === "created") {
    return (status === undefined || status === 201)
      && (legacy || (value.code === "report_created" && value.counted === true));
  }
  if (value.status === "duplicate") {
    return legacy ? status === undefined || status === 409
      : (status === undefined || status === 200) && value.code === "report_duplicate" && value.counted === false;
  }
  return false;
}
