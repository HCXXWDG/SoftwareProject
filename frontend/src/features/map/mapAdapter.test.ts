import { afterEach, describe, expect, it, vi } from "vitest";
import type { AMapNamespaceLike } from "./amapLoader";
import { resetAMapLoaderForTests } from "./amapLoader";
import { createAMapAdapter } from "./mapAdapter";
import type { MapViewportConstraint } from "./viewport";

const CAMPUS_CONSTRAINT: MapViewportConstraint = {
  center: { longitude: 120.273915, latitude: 31.479302 },
  bounds: {
    west: 120.26067,
    south: 31.47278,
    east: 120.27946,
    north: 31.49417,
  },
  minZoom: 15,
  maxZoom: 18,
  defaultZoom: 16,
};

function buildNamespace(optionsSpy: {
  value: Record<string, unknown> | null;
}): AMapNamespaceLike {
  const listeners = new Map<string, () => void>();
  const namespace: AMapNamespaceLike = {
    Bounds: class {
      private sw: [number, number];
      private ne: [number, number];
      constructor(sw: [number, number], ne: [number, number]) {
        this.sw = sw;
        this.ne = ne;
      }
      getSouthWest() { return { lng: this.sw[0], lat: this.sw[1] }; }
      getNorthEast() { return { lng: this.ne[0], lat: this.ne[1] }; }
    },
    Map: class {
      constructor(_container: HTMLElement, options: Record<string, unknown>) {
        optionsSpy.value = options;
      }
      destroy = vi.fn();
      getBounds() {
        return {
          getNorthEast: () => ({ lng: 120.2794, lat: 31.4941 }),
          getSouthWest: () => ({ lng: 120.2607, lat: 31.4728 }),
        };
      }
      getCenter() {
        return { lng: 120.273915, lat: 31.479302 };
      }
      getZoom() {
        return 16;
      }
      setCenter = vi.fn();
      setZoom = vi.fn();
      lngLatToContainer() {
        return { x: 480, y: 300 };
      }
      containerToLngLat() {
        return { getLng: () => 120.2739, getLat: () => 31.4793 };
      }
      off(eventName: string) {
        listeners.delete(eventName);
      }
      on(eventName: string, listener: () => void) {
        listeners.set(eventName, listener);
      }
    },
  };
  return namespace;
}

afterEach(() => {
  resetAMapLoaderForTests();
});

describe("createAMapAdapter viewport constraint", () => {
  it("bounds button zooms and restores the configured initial center and zoom", () => {
    const namespace = buildNamespace({ value: null });
    const BaseMap = namespace.Map;
    let currentZoom = 16;
    const setCenter = vi.fn();
    const setZoom = vi.fn((zoom: number) => { currentZoom = zoom; });
    namespace.Map = class extends BaseMap { setCenter = setCenter; setZoom = setZoom; getZoom = () => currentZoom; };
    const adapter = createAMapAdapter(document.createElement("div"), namespace, { viewportConstraint: CAMPUS_CONSTRAINT });
    adapter.zoomBy(100);
    expect(setZoom).toHaveBeenLastCalledWith(18);
    adapter.zoomBy(-100);
    expect(setZoom).toHaveBeenLastCalledWith(15);
    adapter.zoomBy(Number.NaN);
    expect(setZoom).toHaveBeenCalledTimes(2);
    adapter.resetViewport();
    expect(setZoom).toHaveBeenLastCalledWith(16);
    expect(setCenter).toHaveBeenLastCalledWith([120.273915, 31.479302]);
    adapter.destroy();
    adapter.zoomBy(1);
    adapter.resetViewport();
    expect(setZoom).toHaveBeenCalledTimes(3);
  });

  it("distinguishes live overlay reprojection from committed viewport queries and unregisters both", () => {
    const namespace = buildNamespace({ value: null });
    const BaseMap = namespace.Map;
    const events = new Map<string, () => void>();
    namespace.Map = class extends BaseMap {
      on = (name: string, listener: () => void) => { events.set(name, listener); };
      off = (name: string) => { events.delete(name); };
    };
    const adapter = createAMapAdapter(document.createElement("div"), namespace);
    const listener = vi.fn();
    const unsubscribe = adapter.subscribe(listener);
    events.get("mapmove")?.();
    events.get("zoomchange")?.();
    expect(listener.mock.calls).toEqual([[false], [false]]);
    events.get("moveend")?.();
    events.get("zoomend")?.();
    expect(listener.mock.calls.slice(2)).toEqual([[true], [true]]);
    unsubscribe();
    events.get("mapmove")?.();
    expect(listener).toHaveBeenCalledTimes(4);
    adapter.destroy();
    expect(events.size).toBe(0);
  });
  it("pans an overlay gesture using projected pixels and clamps the resulting center", () => {
    const options = { value: null as Record<string, unknown> | null };
    const namespace = buildNamespace(options);
    const BaseMap = namespace.Map;
    const setCenter = vi.fn();
    const unproject = vi.fn(() => ({ lng: CAMPUS_CONSTRAINT.bounds.east + 1, lat: CAMPUS_CONSTRAINT.bounds.north + 1 }));
    namespace.Map = class extends BaseMap { setCenter = setCenter; containerToLngLat = unproject; };
    const adapter = createAMapAdapter(document.createElement("div"), namespace, { viewportConstraint: CAMPUS_CONSTRAINT });
    adapter.panByPixels(40, -20);
    expect(unproject).toHaveBeenCalledWith([440, 320]);
    expect(setCenter).toHaveBeenCalledWith([CAMPUS_CONSTRAINT.bounds.east, CAMPUS_CONSTRAINT.bounds.north]);
    adapter.destroy();
  });
  it("applies zooms and limitBounds when a constraint is supplied", () => {
    const container = document.createElement("div");
    const options: { value: Record<string, unknown> | null } = { value: null };
    const adapter = createAMapAdapter(
      container,
      buildNamespace(options),
      { viewportConstraint: CAMPUS_CONSTRAINT },
    );

    expect(options.value).toMatchObject({
      center: [120.273915, 31.479302],
      zoom: 16,
      zooms: [15, 18],
      limitBounds: [120.26067, 31.47278, 120.27946, 31.49417],
    });

    adapter.destroy();
  });

  it("omits zooms and limitBounds when no constraint is supplied", () => {
    const container = document.createElement("div");
    const options: { value: Record<string, unknown> | null } = { value: null };
    const adapter = createAMapAdapter(container, buildNamespace(options));

    expect(options.value).not.toHaveProperty("zooms");
    expect(options.value).not.toHaveProperty("limitBounds");
    expect(options.value).toMatchObject({
      center: [expect.any(Number), expect.any(Number)],
    });

    adapter.destroy();
  });
});
