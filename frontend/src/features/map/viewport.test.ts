import { describe, expect, it } from "vitest";
import type { GeoPoint } from "../../types";
import {
  calculateViewport,
  clampCenterToBounds,
  clampZoom,
  confidenceToOpacity,
  DEFAULT_MAP_CENTER,
  isPointInBounds,
  projectGeoPoint,
  scoreToColor,
  unprojectGeoPoint,
  type GeoBounds,
} from "./viewport";

const CAMPUS_BOUNDS: GeoBounds = {
  west: 120.26067,
  south: 31.47278,
  east: 120.27946,
  north: 31.49417,
};

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

  it("clamps zoom to the campus range 15–18", () => {
    expect(clampZoom(13, 15, 18)).toBe(15);
    expect(clampZoom(14.6, 15, 18)).toBe(15);
    expect(clampZoom(20, 15, 18)).toBe(18);
    expect(clampZoom(16, 15, 18)).toBe(16);
  });

  it("clamps center coordinates inside the campus bounds", () => {
    expect(
      clampCenterToBounds(
        { longitude: 120.0, latitude: 31.0 } as GeoPoint,
        CAMPUS_BOUNDS,
      ),
    ).toEqual({
      longitude: CAMPUS_BOUNDS.west,
      latitude: CAMPUS_BOUNDS.south,
    });
    expect(
      clampCenterToBounds(
        { longitude: 121.0, latitude: 32.0 } as GeoPoint,
        CAMPUS_BOUNDS,
      ),
    ).toEqual({
      longitude: CAMPUS_BOUNDS.east,
      latitude: CAMPUS_BOUNDS.north,
    });
    const inside = { longitude: 120.2739, latitude: 31.4793 } as GeoPoint;
    expect(clampCenterToBounds(inside, CAMPUS_BOUNDS)).toEqual(inside);
  });

  it("detects whether a point lies within the campus bounds", () => {
    expect(
      isPointInBounds(
        { longitude: 120.2739, latitude: 31.4793 } as GeoPoint,
        CAMPUS_BOUNDS,
      ),
    ).toBe(true);
    expect(
      isPointInBounds(
        { longitude: 120.2, latitude: 31.4793 } as GeoPoint,
        CAMPUS_BOUNDS,
      ),
    ).toBe(false);
    expect(
      isPointInBounds(
        { longitude: 120.27946, latitude: 31.49417 } as GeoPoint,
        CAMPUS_BOUNDS,
      ),
    ).toBe(true);
  });
});
