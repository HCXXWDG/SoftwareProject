import { describe, expect, it } from "vitest";
import { PRODUCT_NAME, SERVICE_AREA, SERVICE_DEFAULT_BBOX, SERVICE_VIEWPORT_CONSTRAINT, WAYPOINTS, isPointInServiceArea } from "./serviceArea";

describe("Liangxi service area", () => {
  it("uses the city product name, a district overview and street detail zoom", () => {
    expect(PRODUCT_NAME).toBe("心途——通勤情绪地图");
    expect(SERVICE_AREA.id).toBe("320213");
    expect(SERVICE_AREA.defaultZoom).toBeLessThan(15);
    expect(SERVICE_AREA.pickerZoom).toBeGreaterThan(SERVICE_AREA.defaultZoom);
    expect(SERVICE_VIEWPORT_CONSTRAINT.defaultZoom).toBe(SERVICE_AREA.defaultZoom);
    expect(SERVICE_AREA.maxZoom).toBeGreaterThanOrEqual(19);
  });
  it("covers verified Liangxi places, its northern and southern edges, and rejects the former campus", () => {
    for (const place of WAYPOINTS) expect(isPointInServiceArea(place.point), place.name).toBe(true);
    expect(isPointInServiceArea({ longitude: 120.30, latitude: 31.62 })).toBe(true);
    expect(isPointInServiceArea({ longitude: 120.30, latitude: 31.52 })).toBe(true);
    expect(isPointInServiceArea({ longitude: 120.273510, latitude: 31.475328 })).toBe(false);
    expect(isPointInServiceArea({ longitude: Number.NaN, latitude: 31.57 })).toBe(false);
    expect(isPointInServiceArea({ longitude: 120.5, latitude: 31.57 })).toBe(false);
  });
  it("uses the verified district bounding rectangle for the initial heatmap query", () => {
    expect(SERVICE_DEFAULT_BBOX).toBe("120.240331,31.512825,120.352851,31.630931");
    const [west,south,east,north] = SERVICE_DEFAULT_BBOX.split(",").map(Number);
    expect((east-west)*(north-south)).toBeGreaterThan(0.01);
  });
});
