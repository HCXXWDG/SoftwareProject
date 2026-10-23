import { describe, expect, it } from "vitest";
import { isHeatmapCells } from "./responseValidators";

const cell = { cellId: "cell-1", center: { longitude: 120.2739, latitude: 31.4793 },
  score: 0, confidence: 0.6, count: 2, dominantTag: "QUIET" };

describe("heatmap metadata response boundary", () => {
  it("accepts omitted or null metadata without manufacturing provenance or a window", () => {
    expect(isHeatmapCells([cell])).toBe(true);
    const nullable = { ...cell, feedbackSource: null, updatedAt: null, windowHours: null };
    expect(isHeatmapCells([nullable])).toBe(true);
    expect(cell).not.toHaveProperty("feedbackSource");
    expect(cell).not.toHaveProperty("windowHours");
  });

  it.each(["REAL", "DEMO", "MIXED", "NONE", "UNKNOWN"])("accepts the backend %s provenance and complete metadata", feedbackSource => {
    expect(isHeatmapCells([{ ...cell, feedbackSource, updatedAt: "2026-10-22T12:00:00Z", windowHours: 168 }])).toBe(true);
  });

  it.each([
    { feedbackSource: "real" }, { feedbackSource: "FUTURE" }, { feedbackSource: true },
    { updatedAt: "not-a-date" }, { updatedAt: "" }, { updatedAt: 12 },
    { windowHours: 0 }, { windowHours: -1 }, { windowHours: 1.5 }, { windowHours: "24" },
    { windowHours: Number.NaN }, { windowHours: Number.POSITIVE_INFINITY },
  ])("rejects malformed metadata %#", metadata => {
    expect(isHeatmapCells([{ ...cell, ...metadata }])).toBe(false);
  });

  it.each(["NOISE", "CROWD", "SUN", "ODOR", "QUIET", "SHADE", "OPEN", "OTHER"])("continues accepting supported tag %s", dominantTag => {
    expect(isHeatmapCells([{ ...cell, dominantTag }])).toBe(true);
  });

  it("continues rejecting an unknown tag at the API boundary", () => {
    expect(isHeatmapCells([{ ...cell, dominantTag: "FUTURE_TAG" }])).toBe(false);
    expect(isHeatmapCells([{ ...cell, dominantTag: null }])).toBe(false);
  });
});
