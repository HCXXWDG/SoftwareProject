import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeCommute, fetchTrends } from "./commute";
import { fetchHeatmap } from "./heatmap";
import { submitReport } from "./report";
import { compareRoutes } from "./route";
import { isRequestCancelled } from "./api";
import { isCommuteRecord, isHeatmapCells, isRouteComparison, isTrendResult } from "./responseValidators";

const point = { longitude: 120.271, latitude: 31.480 };
const route = {
  id: "r1", label: "东侧步道", distanceMeters: 500, durationSeconds: 450,
  stressExposure: 30, stressScore: 30, confidence: 0.7, fastest: true,
  leastStressful: true, polyline: [point, { longitude: 120.272, latitude: 31.481 }],
};
const comparison = { routes: [route], fastestRouteId: "r1", leastStressfulRouteId: "r1", recommendation: "先走最快路线", recommendAlternative: false };
const commuteInput = {
  routeId: "r1", routeLabel: "东侧步道", endStressLevel: 50, durationMinutes: 8,
  selectedScore: 30, fastestScore: 30, confidence: 0.7,
};
const commute = { ...commuteInput, id: "commute-1", deviceHash: "hash", alternativeLabel: null, alternativeScore: null, alternativeDurationRatio: null, completedAt: "2026-10-18T01:00:00Z" };
const trend = { points: [{ date: "2026-10-18", averageStress: null, commuteCount: 0 }], recommendation: "完成一次通勤后查看趋势。", totalCommutes: 0 };
const report = { location: point, stressLevel: 50, tag: "NOISE" as const };
const cell = { cellId: "cell-1", center: point, score: 50, confidence: 0.5, count: 2, dominantTag: "NOISE" };

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("service contracts", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([
    ["route", (signal: AbortSignal) => compareRoutes({ origin: point, destination: point }, signal)],
    ["heatmap", (signal: AbortSignal) => fetchHeatmap("120,31,121,32", 16, 168, signal)],
    ["complete", (signal: AbortSignal) => completeCommute(commuteInput, signal)],
    ["trends", (signal: AbortSignal) => fetchTrends(7, "Asia/Shanghai", signal)],
    ["report", (signal: AbortSignal) => submitReport(report, signal)],
  ] as const)("forwards %s cancellation to the request", async (_, call) => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));
    const controller = new AbortController();
    const result = call(controller.signal).catch((error: unknown) => error);
    controller.abort();
    expect(isRequestCancelled(await result)).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("accepts the actual legacy backend responses without inventing capability fields", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(comparison))
      .mockResolvedValueOnce(response([cell]))
      .mockResolvedValueOnce(response(commute))
      .mockResolvedValueOnce(response(trend));
    await expect(compareRoutes({ origin: point, destination: point })).resolves.toEqual(comparison);
    await expect(fetchHeatmap("120,31,121,32")).resolves.toEqual([cell]);
    await expect(completeCommute(commuteInput)).resolves.toEqual(commute);
    await expect(fetchTrends()).resolves.toEqual(trend);
    expect(comparison).not.toHaveProperty("routeSource");
  });

  it("returns created only for the backend's created report shape", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ status: "created", message: "情绪反馈已加入热力图。" }, 201));
    await expect(submitReport(report)).resolves.toEqual({ status: "created", message: "情绪反馈已加入热力图。" });
  });

  it("normalizes averages and summary values omitted by Jackson NON_NULL to null", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({
      points: [{ date: "2026-10-18", commuteCount: 0 }], recommendation: "暂无记录", totalCommutes: 0,
      summary: { direction: "unknown", sampleSufficient: false },
    }));
    await expect(fetchTrends()).resolves.toEqual({
      points: [{ date: "2026-10-18", averageStress: null, commuteCount: 0 }], recommendation: "暂无记录", totalCommutes: 0,
      summary: { averageStress: null, stressDelta: null, direction: "unknown", sampleSufficient: false },
    });
  });

  it("normalizes nullable alternative fields omitted by the real commute response", async () => {
    const { alternativeLabel: _label, alternativeScore: _score, alternativeDurationRatio: _ratio, ...withoutAlternatives } = commute;
    vi.mocked(fetch).mockResolvedValueOnce(response(withoutAlternatives));
    await expect(completeCommute(commuteInput)).resolves.toEqual(commute);
  });

  it("preserves valid zero averages and deltas while normalizing missing values", async () => {
    const withZeros = { ...trend, points: [{ date: "2026-10-18", averageStress: 0, commuteCount: 1 }], totalCommutes: 1,
      summary: { averageStress: 0, stressDelta: 0, direction: "stable", sampleSufficient: false } };
    vi.mocked(fetch).mockResolvedValueOnce(response(withZeros));
    await expect(fetchTrends()).resolves.toEqual(withZeros);
  });

  it.each([
    [() => fetchTrends(), { ...trend, summary: { direction: "unknown", sampleSufficient: false, stressDelta: "missing" } }],
    [() => completeCommute(commuteInput), { ...commute, alternativeLabel: false }],
    [() => completeCommute(commuteInput), { ...commute, alternativeScore: "missing" }],
  ] as const)("still rejects an invalid optional value %#", async (call, value) => {
    vi.mocked(fetch).mockResolvedValueOnce(response(value));
    await expect(call()).rejects.toMatchObject({ kind: "format" });
  });

  it("returns duplicate without retrying or pretending another report was created", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ status: "duplicate", message: "五分钟内已提交过附近路段。" }, 409));
    await expect(submitReport(report)).resolves.toEqual({ status: "duplicate", message: "五分钟内已提交过附近路段。" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps unrelated report conflicts as errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ code: "operation_conflict", message: "操作内容冲突。" }, 409));
    await expect(submitReport(report)).rejects.toMatchObject({ kind: "business", code: "operation_conflict" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["routes", () => compareRoutes({ origin: point, destination: point }), { ...comparison, routes: [{ id: "r1" }] }],
    ["heatmap", () => fetchHeatmap("bbox"), [{ ...cell, confidence: 5 }]],
    ["commute", () => completeCommute(commuteInput), { ...commute, completedAt: "yesterday" }],
    ["trends", () => fetchTrends(), { ...trend, points: [{ date: "2026-10-18", averageStress: "unknown", commuteCount: 0 }] }],
    ["report", () => submitReport(report), { status: "ok", message: "saved" }],
  ] as const)("rejects malformed %s instead of trusting a TypeScript cast", async (_, call, value) => {
    vi.mocked(fetch).mockResolvedValue(response(value));
    await expect(call()).rejects.toMatchObject({ kind: "format" });
  });
});

describe("runtime response validation", () => {
  it("accepts zero or one route and validates optional capabilities only when present", () => {
    expect(isRouteComparison(comparison)).toBe(true);
    expect(isRouteComparison({ ...comparison, routes: [], fastestRouteId: "", leastStressfulRouteId: "" })).toBe(true);
    expect(isRouteComparison({ ...comparison, routeSource: "REAL", feedbackSource: "NONE", scoringStatus: "INSUFFICIENT_DATA" })).toBe(true);
    expect(isRouteComparison({ ...comparison, routeSource: "guessed" })).toBe(false);
    expect(isRouteComparison({ ...comparison, scoringStatus: "probably-valid" })).toBe(false);
  });

  it("rejects nonfinite coordinates, unknown references, and duplicate route IDs", () => {
    expect(isRouteComparison({ ...comparison, fastestRouteId: "missing" })).toBe(false);
    expect(isRouteComparison({ ...comparison, routes: [route, route] })).toBe(false);
    expect(isRouteComparison({ ...comparison, routes: [{ ...route, polyline: [{ ...point, longitude: Infinity }] }] })).toBe(false);
    expect(isHeatmapCells([{ ...cell, center: { ...point, latitude: 91 } }])).toBe(false);
  });

  it("allows null stress averages and the current backend's optional trend summary", () => {
    expect(isTrendResult(trend)).toBe(true);
    expect(isTrendResult({ ...trend, summary: { averageStress: null, stressDelta: null, direction: "unknown", sampleSufficient: false } })).toBe(true);
    expect(isTrendResult({ ...trend, summary: { averageStress: 20 } })).toBe(false);
    expect(isTrendResult({ ...trend, totalCommutes: -1 })).toBe(false);
  });

  it("validates null alternatives and finite scores for saved commutes", () => {
    expect(isCommuteRecord(commute)).toBe(true);
    expect(isCommuteRecord({ ...commute, selectedScore: NaN })).toBe(false);
    expect(isCommuteRecord({ ...commute, confidence: 2 })).toBe(false);
    expect(isCommuteRecord({ ...commute, endStressLevel: 42 })).toBe(false);
  });
});
