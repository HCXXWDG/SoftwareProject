import type { TrendResult } from "../types";
import { isTrendResult, type TrendResultResponse } from "./responseValidators";

export type CompatibleTrendResultResponse = TrendResultResponse;
const count = (value: unknown): value is number => typeof value === "number"
  && Number.isSafeInteger(value) && value >= 0;
const optionalCount = (value: unknown) => value === undefined || count(value);
const positive = (value: unknown): value is number => typeof value === "number"
  && Number.isFinite(value) && value > 0;

/** Read D05 additions without inventing them for a legacy response. */
export function isCompatibleTrendResult(value: unknown): value is CompatibleTrendResultResponse {
  if (!isTrendResult(value)) return false;
  const { days, timezone, unknownSourceCommutes, excludedDemoCommutes, deduplicatedCommutes, outOfWindowCommutes } = value;
  if (days !== undefined && (!count(days) || days < 1 || days > 30)) return false;
  if (timezone !== undefined && (typeof timezone !== "string" || !timezone.trim())) return false;
  if (![unknownSourceCommutes, excludedDemoCommutes, deduplicatedCommutes, outOfWindowCommutes].every(optionalCount)) return false;
  if (unknownSourceCommutes !== undefined && unknownSourceCommutes > value.totalCommutes) return false;
  for (const entry of value.points) {
    if (days !== undefined && (entry.commuteCount === 0 ? entry.averageStress != null : entry.averageStress == null)) return false;
    if (!optionalCount(entry.estimatedSampleCount)
      || (entry.estimatedSampleCount !== undefined && entry.estimatedSampleCount > entry.commuteCount)) return false;
    if (entry.averageEstimatedSeconds != null && !positive(entry.averageEstimatedSeconds)) return false;
    if (entry.estimatedSampleCount === 0 && entry.averageEstimatedSeconds != null) return false;
    if (entry.estimatedSampleCount !== undefined && entry.estimatedSampleCount > 0 && entry.averageEstimatedSeconds == null) return false;
  }
  // D05 declares a complete natural-day window. Legacy responses had a different window.
  if (days !== undefined) {
    if (value.points.length !== days || value.points.reduce((sum, entry) => sum + entry.commuteCount, 0) !== value.totalCommutes) return false;
    let previous: number | undefined;
    for (const entry of value.points) {
      const date = Date.parse(`${entry.date}T00:00:00Z`);
      if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== entry.date
        || (previous !== undefined && date - previous !== 86_400_000)) return false;
      previous = date;
    }
  }
  return true;
}

export function normalizeTrendResult(result: CompatibleTrendResultResponse): TrendResult {
  const { points, summary, ...metadata } = result;
  return {
    ...metadata,
    points: points.map((entry) => ({
      ...entry,
      averageStress: entry.averageStress ?? null,
      ...(entry.estimatedSampleCount !== undefined || entry.averageEstimatedSeconds !== undefined
        ? { averageEstimatedSeconds: entry.averageEstimatedSeconds ?? null } : {}),
    })),
    ...(summary ? { summary: {
      ...summary,
      averageStress: summary.averageStress ?? null,
      stressDelta: summary.stressDelta ?? null,
    } } : {}),
  };
}
