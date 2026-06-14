import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadAMap,
  resetAMapLoaderForTests,
  type AMapNamespaceLike,
} from "./amapLoader";

const namespace = {
  Map: class {
    destroy() {}
    getBounds() {
      return {
        getNorthEast: () => ({ lng: 116.41, lat: 39.92 }),
        getSouthWest: () => ({ lng: 116.39, lat: 39.9 }),
      };
    }
    getZoom() {
      return 14;
    }
    lngLatToContainer() {
      return { x: 0, y: 0 };
    }
    containerToLngLat() {
      return { getLng: () => 116.4, getLat: () => 39.91 };
    }
    off() {}
    on() {}
  },
} satisfies AMapNamespaceLike;

afterEach(() => {
  vi.useRealTimers();
  resetAMapLoaderForTests();
});

describe("loadAMap", () => {
  it("configures the security code and shares one script promise", async () => {
    const first = loadAMap({
      key: "browser-key",
      securityCode: "security-code",
    });
    const second = loadAMap({
      key: "browser-key",
      securityCode: "security-code",
    });
    const script = document.querySelector<HTMLScriptElement>(
      "#commute-mood-amap-js",
    );

    expect(first).toBe(second);
    expect(script).not.toBeNull();
    expect(script?.src).toContain("key=browser-key");
    expect(window._AMapSecurityConfig?.securityJsCode).toBe("security-code");
    expect(document.querySelectorAll("#commute-mood-amap-js")).toHaveLength(1);

    window.AMap = namespace;
    script?.dispatchEvent(new Event("load"));

    await expect(first).resolves.toBe(namespace);
  });

  it("rejects when the SDK script fails", async () => {
    const loading = loadAMap({ key: "browser-key" });
    const result = loading.catch((error: unknown) => error);
    const script = document.querySelector<HTMLScriptElement>(
      "#commute-mood-amap-js",
    );

    script?.dispatchEvent(new Event("error"));

    await expect(result).resolves.toEqual(
      expect.objectContaining({ message: expect.stringContaining("Failed to load") }),
    );
    expect(document.querySelector("#commute-mood-amap-js")).toBeNull();
  });

  it("rejects when the SDK does not load before the timeout", async () => {
    vi.useFakeTimers();
    const loading = loadAMap({ key: "browser-key", timeoutMs: 100 });
    const result = loading.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(101);

    await expect(result).resolves.toEqual(
      expect.objectContaining({ message: expect.stringContaining("Timed out") }),
    );
  });
});
