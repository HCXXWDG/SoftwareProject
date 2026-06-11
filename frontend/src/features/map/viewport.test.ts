import { describe, expect, it } from "vitest";
import {
  calculateViewport,
  confidenceToOpacity,
  DEFAULT_MAP_CENTER,
  projectGeoPoint,
  scoreToColor,
} from "./viewport";

describe("map viewport helpers", () => {
  it("formats bbox as west,south,east,north", () => {
    const viewport = calculateViewport(DEFAULT_MAP_CENTER, 14, {
      width: 960,
      height: 600,
    });
    const [west, south, east, north] = viewport.bbox.split(",").map(Number);

    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    expect(viewport.zoom).toBe(14);
  });

  it("projects the map center to the viewport center", () => {
    expect(
      projectGeoPoint(DEFAULT_MAP_CENTER, DEFAULT_MAP_CENTER, 14, {
        width: 960,
        height: 600,
      }),
    ).toEqual({ x: 480, y: 300 });
  });

  it("maps stress and confidence to bounded visual values", () => {
    expect(scoreToColor(0)).toBe("rgb(35, 104, 255)");
    expect(scoreToColor(100)).toBe("rgb(239, 68, 68)");
    expect(confidenceToOpacity(0)).toBe(0.18);
    expect(confidenceToOpacity(2)).toBe(1);
  });
});
