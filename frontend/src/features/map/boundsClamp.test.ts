import { describe, it, expect } from "vitest";
import { clampCenter, clampZoom, isInsideBounds } from "./boundsClamp";
import { CAMPUS } from "../../config/campus";

describe("clampCenter", () => {
  it("returns the same point when inside bounds", () => {
    const point = { longitude: 120.338, latitude: 31.488 };
    const result = clampCenter(point);
    expect(result.longitude).toBe(point.longitude);
    expect(result.latitude).toBe(point.latitude);
  });

  it("clamps longitude to west boundary", () => {
    const point = { longitude: 120.0, latitude: 31.488 };
    const result = clampCenter(point);
    expect(result.longitude).toBe(CAMPUS.bounds.west);
  });

  it("clamps longitude to east boundary", () => {
    const point = { longitude: 121.0, latitude: 31.488 };
    const result = clampCenter(point);
    expect(result.longitude).toBe(CAMPUS.bounds.east);
  });

  it("clamps latitude to south boundary", () => {
    const point = { longitude: 120.338, latitude: 31.0 };
    const result = clampCenter(point);
    expect(result.latitude).toBe(CAMPUS.bounds.south);
  });

  it("clamps latitude to north boundary", () => {
    const point = { longitude: 120.338, latitude: 32.0 };
    const result = clampCenter(point);
    expect(result.latitude).toBe(CAMPUS.bounds.north);
  });

  it("clamps both axes when outside corner", () => {
    const point = { longitude: 100.0, latitude: 50.0 };
    const result = clampCenter(point);
    expect(result.longitude).toBe(CAMPUS.bounds.west);
    expect(result.latitude).toBe(CAMPUS.bounds.north);
  });

  it("supports custom bounds", () => {
    const custom = { south: 0, west: 0, north: 10, east: 10 };
    const point = { longitude: -5, latitude: 15 };
    const result = clampCenter(point, custom);
    expect(result.longitude).toBe(0);
    expect(result.latitude).toBe(10);
  });
});

describe("clampZoom", () => {
  it("returns the same zoom when within range", () => {
    expect(clampZoom(16)).toBe(16);
  });

  it("clamps to minZoom", () => {
    expect(clampZoom(10)).toBe(CAMPUS.minZoom);
  });

  it("clamps to maxZoom", () => {
    expect(clampZoom(25)).toBe(CAMPUS.maxZoom);
  });

  it("supports custom min/max", () => {
    expect(clampZoom(5, 8, 12)).toBe(8);
    expect(clampZoom(20, 8, 12)).toBe(12);
    expect(clampZoom(10, 8, 12)).toBe(10);
  });
});

describe("isInsideBounds", () => {
  it("returns true for campus center", () => {
    expect(isInsideBounds(CAMPUS.center)).toBe(true);
  });

  it("returns true for campus origin", () => {
    expect(isInsideBounds(CAMPUS.origin)).toBe(true);
  });

  it("returns true for campus destination", () => {
    expect(isInsideBounds(CAMPUS.destination)).toBe(true);
  });

  it("returns false for point outside west", () => {
    expect(isInsideBounds({ longitude: 119.0, latitude: 31.488 })).toBe(false);
  });

  it("returns false for point outside north", () => {
    expect(isInsideBounds({ longitude: 120.338, latitude: 32.0 })).toBe(false);
  });

  it("returns true for point exactly on boundary", () => {
    expect(
      isInsideBounds({ longitude: CAMPUS.bounds.west, latitude: CAMPUS.bounds.south }),
    ).toBe(true);
  });

  it("supports custom bounds", () => {
    const custom = { south: 0, west: 0, north: 10, east: 10 };
    expect(isInsideBounds({ longitude: 5, latitude: 5 }, custom)).toBe(true);
    expect(isInsideBounds({ longitude: 15, latitude: 5 }, custom)).toBe(false);
  });
});
