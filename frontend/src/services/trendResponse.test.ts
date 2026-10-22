import { describe, expect, it } from "vitest";
import { isCompatibleTrendResult, normalizeTrendResult } from "./trendResponse";

const empty = {
  points: [{ date: "2026-10-18", commuteCount: 0, estimatedSampleCount: 0 }, { date: "2026-10-19", commuteCount: 0, estimatedSampleCount: 0 }],
  totalCommutes: 0, recommendation: "继续积累反馈", days: 2, timezone: "Asia/Shanghai",
  unknownSourceCommutes: 0, excludedDemoCommutes: 0, deduplicatedCommutes: 0, outOfWindowCommutes: 0,
  summary: { direction: "unknown" as const, sampleSufficient: false },
};

describe("D05 trend compatibility", () => {
  it("normalizes omitted averages without inventing zero stress or zero seconds", () => {
    expect(isCompatibleTrendResult(empty)).toBe(true);
    const normalized = normalizeTrendResult(empty);
    expect(normalized.points[0]).toEqual({ ...empty.points[0], averageStress: null, averageEstimatedSeconds: null });
    expect(normalized.summary).toEqual({ ...empty.summary, averageStress: null, stressDelta: null });
    expect(normalized.unknownSourceCommutes).toBe(0);
  });
  it("keeps old responses readable without inventing D05 metadata", () => {
    const old = { points: [{ date: "2026-10-19", commuteCount: 0 }], totalCommutes: 0, recommendation: "暂无记录" };
    expect(isCompatibleTrendResult(old)).toBe(true);
    const normalized = normalizeTrendResult(old);
    expect(normalized.points[0]).toEqual({ ...old.points[0], averageStress: null });
    expect(normalized).not.toHaveProperty("days");
    expect(normalized.points[0]).not.toHaveProperty("estimatedSampleCount");
  });
  it("preserves valid zero stress and a server estimate under one minute", () => {
    const result = { ...empty, totalCommutes: 1, unknownSourceCommutes: 1,
      points: [empty.points[0], { date: "2026-10-19", commuteCount: 1, averageStress: 0, estimatedSampleCount: 1, averageEstimatedSeconds: 45 }] };
    expect(isCompatibleTrendResult(result)).toBe(true);
    expect(normalizeTrendResult(result).points[1]).toEqual(result.points[1]);
  });
  it("rejects contradictory sample counts and estimated averages", () => {
    for (const point of [
      { ...empty.points[0], estimatedSampleCount: 1 },
      { ...empty.points[0], averageEstimatedSeconds: 45 },
      { ...empty.points[0], commuteCount: 1, estimatedSampleCount: 1 },
      { ...empty.points[0], averageEstimatedSeconds: 0 },
    ]) expect(isCompatibleTrendResult({ ...empty, points: [point, empty.points[1]] })).toBe(false);
  });
  it("checks declared natural-day order, gaps and the sum of daily counts", () => {
    expect(isCompatibleTrendResult({ ...empty, points: [...empty.points].reverse() })).toBe(false);
    expect(isCompatibleTrendResult({ ...empty, points: [empty.points[0], { ...empty.points[1], date: "2026-10-20" }] })).toBe(false);
    expect(isCompatibleTrendResult({ ...empty, totalCommutes: 1 })).toBe(false);
    expect(isCompatibleTrendResult({ ...empty, days: 3 })).toBe(false);
  });
  it("requires D05 empty days and recorded days to agree with their stress averages", () => {
    expect(isCompatibleTrendResult({ ...empty, points: [{ ...empty.points[0], averageStress: 75 }, empty.points[1]] })).toBe(false);
    expect(isCompatibleTrendResult({ ...empty, totalCommutes: 1,
      points: [{ ...empty.points[0], commuteCount: 1 }, empty.points[1]] })).toBe(false);
  });
  it("rejects invalid source metadata instead of displaying it as trustworthy counts", () => {
    expect(isCompatibleTrendResult({ ...empty, unknownSourceCommutes: 1 })).toBe(false);
    expect(isCompatibleTrendResult({ ...empty, excludedDemoCommutes: -1 })).toBe(false);
    expect(isCompatibleTrendResult({ ...empty, deduplicatedCommutes: "0" })).toBe(false);
  });
});
