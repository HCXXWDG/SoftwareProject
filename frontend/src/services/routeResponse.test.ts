import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareRoutes } from "./route";
import { isRouteComparison } from "./responseValidators";

// Mirrors B #67's RouteComparison/ScoredRoute JSON, including Jackson NON_NULL.
// These fixtures check the consumer contract; they are not a real-backend integration test.
const origin = { longitude: 120.27351, latitude: 31.475328 };
const destination = { longitude: 120.274319, latitude: 31.483275 };
const snapshotId = "9f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40";
const baseRoute = {
  id: "amap-walking-1", label: "步行路线", distanceMeters: 850, durationSeconds: 600,
  confidence: 0, fastest: true, leastStressful: false, polyline: [origin, destination],
};
const insufficient = {
  routes: [{ ...baseRoute, scoringStatus: "INSUFFICIENT_DATA" }],
  fastestRouteId: baseRoute.id, recommendation: "当前只有一条可用步行路线。", recommendAlternative: false,
  routeSource: "REAL", feedbackSource: "NONE", scoringStatus: "INSUFFICIENT_DATA",
  recommendationReason: "NO_ALTERNATIVE", scoringVersion: "walking-v2", travelMode: "WALKING", snapshotId,
};
const valid = {
  ...insufficient,
  routes: [{ ...baseRoute, stressExposure: 0, stressScore: 0, confidence: 1, leastStressful: true, scoringStatus: "VALID" }],
  leastStressfulRouteId: baseRoute.id, feedbackSource: "REAL", scoringStatus: "VALID", recommendationReason: "SAME_ROUTE",
  recommendationDetails: { extraDurationSeconds: 0, durationRatio: 1, environmentImprovement: 0, compositeImprovement: 0, dataCoverage: 1 },
};

function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("B walking-comparison response compatibility", () => {
  it("accepts B's 200 real-route response with missing scores and calm route id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(respond(insufficient));
    const result = await compareRoutes({ origin, destination });
    expect(result).toMatchObject({ routeSource: "REAL", feedbackSource: "NONE", scoringStatus: "INSUFFICIENT_DATA",
      snapshotId, scoringVersion: "walking-v2", travelMode: "WALKING", leastStressfulRouteId: null });
    expect(result.routes[0]).toMatchObject({ stressExposure: null, stressScore: null, confidence: 0 });
    expect(result.recommendAlternative).toBe(false);
  });

  it("normalizes explicit null scores without inventing zero values", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(respond({ ...insufficient, leastStressfulRouteId: null,
      routes: [{ ...baseRoute, stressExposure: null, stressScore: null, scoringStatus: "INSUFFICIENT_DATA" }] }));
    const result = await compareRoutes({ origin, destination });
    expect(result.leastStressfulRouteId).toBeNull();
    expect(result.routes[0].stressExposure).toBeNull();
    expect(result.routes[0].stressScore).toBeNull();
  });

  it("preserves genuine zero scores and complete B recommendation details", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(respond(valid));
    await expect(compareRoutes({ origin, destination })).resolves.toEqual(valid);
  });

  it.each([{}, { fastestRouteId: null, leastStressfulRouteId: null }])
    ("accepts empty B NO_ROUTE results with omitted or null route ids: %j", async (ids) => {
      vi.mocked(fetch).mockResolvedValueOnce(respond({
        routes: [], recommendation: "当前起终点没有可用的步行路线。", recommendAlternative: false,
        routeSource: "UNAVAILABLE", feedbackSource: "NONE", scoringStatus: "UNAVAILABLE",
        recommendationReason: "NO_ROUTE", scoringVersion: "walking-v2", travelMode: "WALKING", ...ids,
      }));
      await expect(compareRoutes({ origin, destination })).resolves.toMatchObject({
        routes: [], fastestRouteId: null, leastStressfulRouteId: null, recommendationReason: "NO_ROUTE",
      });
    });

  it.each(["REAL", "DEMO", "MIXED", "NONE", "UNKNOWN"])
    ("accepts the declared B feedback source %s without guessing another source", async (feedbackSource) => {
      vi.mocked(fetch).mockResolvedValueOnce(respond({ ...insufficient, routeSource: "UNKNOWN", feedbackSource }));
      const result = await compareRoutes({ origin, destination });
      expect(result.feedbackSource).toBe(feedbackSource);
      expect(result.routeSource).toBe("UNKNOWN");
      expect(result.scoringStatus).toBe("INSUFFICIENT_DATA");
    });

  it("reads legacy metadata-free results without constructing provenance or a snapshot", async () => {
    const legacy = { routes: [{ ...baseRoute, stressExposure: 25, stressScore: 20 }],
      fastestRouteId: baseRoute.id, leastStressfulRouteId: baseRoute.id, recommendation: "", recommendAlternative: false };
    vi.mocked(fetch).mockResolvedValueOnce(respond(legacy));
    const result = await compareRoutes({ origin, destination });
    expect(result).toEqual(legacy);
    expect(result).not.toHaveProperty("routeSource");
    expect(result).not.toHaveProperty("scoringStatus");
    expect(result).not.toHaveProperty("snapshotId");
  });

  it("does not reinterpret an older comparisonId as B's snapshotId", async () => {
    const { snapshotId: unusedSnapshotId, ...withoutSnapshot } = insufficient;
    expect(unusedSnapshotId).toBe(snapshotId);
    vi.mocked(fetch).mockResolvedValueOnce(respond({ ...withoutSnapshot, comparisonId: "legacy-comparison" }));
    const result = await compareRoutes({ origin, destination });
    expect(result.comparisonId).toBe("legacy-comparison");
    expect(result).not.toHaveProperty("snapshotId");
  });

  it.each(["stressExposure", "stressScore", "confidence"])
    ("rejects declared VALID results missing %s", async (field) => {
      const missing: Record<string, unknown> = { ...valid.routes[0] };
      delete missing[field];
      vi.mocked(fetch).mockResolvedValueOnce(respond({ ...valid, routes: [missing] }));
      await expect(compareRoutes({ origin, destination })).rejects.toMatchObject({ kind: "format" });
    });

  it.each([null, "not-a-score", -1, 101])("rejects invalid VALID scores %j", async (stressScore) => {
    vi.mocked(fetch).mockResolvedValueOnce(respond({ ...valid, routes: [{ ...valid.routes[0], stressScore }] }));
    await expect(compareRoutes({ origin, destination })).rejects.toMatchObject({ kind: "format" });
  });

  it("does not allow a top-level VALID status to override an unavailable route", () => {
    expect(isRouteComparison({ ...valid, routes: [{ ...valid.routes[0], scoringStatus: "UNAVAILABLE" }] })).toBe(false);
    expect(isRouteComparison({ ...valid, leastStressfulRouteId: null })).toBe(false);
    expect(isRouteComparison({ ...valid, routes: [], fastestRouteId: null, leastStressfulRouteId: null })).toBe(false);
  });

  it("requires complete numbers when an individual route declares VALID", () => {
    expect(isRouteComparison({ ...insufficient, routes: [{ ...baseRoute, scoringStatus: "VALID" }] })).toBe(false);
  });

  it("normalizes recommendation improvements omitted by NON_NULL", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(respond({ ...valid,
      recommendationDetails: { extraDurationSeconds: 0, durationRatio: 1, dataCoverage: 0.8 } }));
    const result = await compareRoutes({ origin, destination });
    expect(result.recommendationDetails).toEqual({ extraDurationSeconds: 0, durationRatio: 1, dataCoverage: 0.8,
      environmentImprovement: null, compositeImprovement: null });
  });

  it.each([
    { snapshotId: "not-a-uuid" }, { scoringVersion: 5 }, { travelMode: "DRIVING" },
    { recommendationDetails: { ...valid.recommendationDetails, dataCoverage: 2 } },
    { recommendationDetails: { ...valid.recommendationDetails, durationRatio: 0 } },
    { recommendationDetails: { ...valid.recommendationDetails, extraDurationSeconds: -1 } },
    { feedbackSource: "GUESSED_REAL" }, { routeSource: "inferred-from-amap-id" },
  ])("rejects malformed new B metadata: %j", async (metadata) => {
    vi.mocked(fetch).mockResolvedValueOnce(respond({ ...valid, ...metadata }));
    await expect(compareRoutes({ origin, destination })).rejects.toMatchObject({ kind: "format" });
  });

  it("continues to reject invalid geometry, unknown references, and duplicate ids", () => {
    expect(isRouteComparison({ ...insufficient, routes: [{ ...baseRoute, polyline: [{ longitude: 999, latitude: 31 }] }] })).toBe(false);
    expect(isRouteComparison({ ...insufficient, fastestRouteId: "missing-route" })).toBe(false);
    expect(isRouteComparison({ ...insufficient, leastStressfulRouteId: "missing-route" })).toBe(false);
    expect(isRouteComparison({ ...insufficient, routes: [baseRoute, baseRoute] })).toBe(false);
  });

  it("keeps B's explicit 503 provider failure as an error, preserving its code and making one request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(respond({ status: 503, code: "route_provider_unavailable",
      message: "步行路线服务暂不可用，请重试或明确选择演示模式。" }, 503));
    await expect(compareRoutes({ origin, destination })).rejects.toMatchObject({
      kind: "http", status: 503, code: "route_provider_unavailable",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
