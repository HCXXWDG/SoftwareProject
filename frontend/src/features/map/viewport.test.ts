import { describe, expect, it } from "vitest";
import {
  calculateViewport,
  confidenceToOpacity,
  DEFAULT_MAP_CENTER,
  projectGeoPoint,
  scoreToColor,
  unprojectGeoPoint,
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

  it("round-trips project then unproject back to the original GeoPoint", () => {
    const size = { width: 960, height: 600 };
    const original = { longitude: 116.405, latitude: 39.915 };
    const projected = projectGeoPoint(original, DEFAULT_MAP_CENTER, 14, size);
    const recovered = unprojectGeoPoint(projected, DEFAULT_MAP_CENTER, 14, size);

    expect(recovered.longitude).toBeCloseTo(original.longitude, 5);
    expect(recovered.latitude).toBeCloseTo(original.latitude, 5);
  });
});
