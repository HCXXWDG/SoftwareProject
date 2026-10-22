import { describe, expect, it } from "vitest";
import { routePanelPresentation, routeSourceLabel, tripCapabilities } from "./capabilities";
import { routeComparison } from "../test/fixtures";
import type { RouteComparison } from "../types";

const valid: RouteComparison = { ...routeComparison, routeSource: "REAL", feedbackSource: "REAL", scoringStatus: "VALID" };

describe("A to C01 presentation contract", () => {
  it("keeps genuine zero scores valid without granting commute capability", () => {
    const zero = { ...valid, routes: valid.routes.map(route => ({ ...route, stressExposure: 0, stressScore: 0 })) };
    expect(routePanelPresentation(zero)).toEqual({ routeSource: "real", scoringStatus: "valid" });
    expect(routeSourceLabel(zero)).toBe("真实路线 · 评分有效");
    expect(tripCapabilities(zero, "available", "offline").canComplete).toBe(false);
  });

  it.each(["DEMO", "MIXED", "NONE", "UNKNOWN", undefined] as const)("does not promote %s feedback into real scoring", (feedbackSource) => {
    const comparison = { ...valid, feedbackSource };
    expect(routePanelPresentation(comparison)).toEqual({ routeSource: "real", scoringStatus: "none" });
    expect(routeSourceLabel(comparison)).toBe("真实路线 · 暂无有效评分");
  });

  it.each(["UNKNOWN", "UNAVAILABLE", undefined] as const)("maps %s route provenance to unknown", (routeSource) => {
    expect(routePanelPresentation({ ...valid, routeSource })).toEqual({ routeSource: "unknown", scoringStatus: "none" });
  });

  it("maps demo to mock without presenting a valid real comfort score", () => {
    expect(routePanelPresentation({ ...valid, routeSource: "DEMO" })).toEqual({ routeSource: "mock", scoringStatus: "none" });
  });

  it("preserves insufficient data separately from unavailable scoring", () => {
    expect(routePanelPresentation({ ...valid, scoringStatus: "INSUFFICIENT_DATA" })).toEqual({ routeSource: "real", scoringStatus: "insufficient" });
    expect(routePanelPresentation({ ...valid, scoringStatus: "UNAVAILABLE" }).scoringStatus).toBe("none");
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])("hides an incomplete score %s even if metadata claims VALID", (stressScore) => {
    const comparison = { ...valid, routes: [{ ...valid.routes[0], stressScore }] };
    expect(routePanelPresentation(comparison).scoringStatus).toBe("none");
    expect(routeSourceLabel(comparison)).toBe("真实路线 · 暂无有效评分");
  });

  it("does not show a score for empty routes or legacy metadata", () => {
    expect(routePanelPresentation({ ...valid, routes: [] }).scoringStatus).toBe("none");
    expect(routePanelPresentation(routeComparison)).toEqual({ routeSource: "unknown", scoringStatus: "none" });
  });
  it.each([{ stressScore: -1 }, { stressExposure: 101 }, { confidence: 2 }, { confidence: Number.NaN }, { scoringStatus: "UNAVAILABLE" as const }])(
    "does not advertise internally contradictory scores as valid: %j", (change) => {
      const comparison = { ...valid, routes: [{ ...valid.routes[0], ...change }] };
      expect(routePanelPresentation(comparison).scoringStatus).toBe("none");
      expect(routeSourceLabel(comparison)).toBe("真实路线 · 暂无有效评分");
    });
});
