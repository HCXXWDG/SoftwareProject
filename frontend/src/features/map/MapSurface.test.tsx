import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeatmapCell, MapFeedbackDraft, ScoredRoute } from "../../types";
import {
  resetAMapLoaderForTests,
  type AMapNamespaceLike,
} from "./amapLoader";
import { MapSurface, type MapSurfaceProps } from "./MapSurface";

const heatmapCell: HeatmapCell = {
  cellId: "cell-1",
  center: {
    longitude: 120.338,
    latitude: 31.488,
  },
  score: 100,
  confidence: 0.05,
  count: 18,
  dominantTag: "NOISE",
};

const defaultProps: Omit<MapSurfaceProps, "heatmapCells" | "loading"> = {
  routes: [],
  onFeedbackSubmit: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  onRouteSelect: vi.fn(),
  onViewportChange: vi.fn(),
};

function lastCall(mock: ReturnType<typeof vi.fn>): unknown[] {
  return mock.mock.calls[mock.mock.calls.length - 1] ?? [];
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetAMapLoaderForTests();
});

describe("MapSurface", () => {
  it("uses the interactive offline map when no browser key is configured", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const onViewportChange = vi.fn();

    render(
      <MapSurface
        {...defaultProps}
        heatmapCells={[heatmapCell]}
        loading={false}
        onViewportChange={onViewportChange}
      />,
    );

    expect(await screen.findByText("离线演示地图")).toBeInTheDocument();
    await waitFor(() => expect(onViewportChange).toHaveBeenCalled());

    const [bbox, zoom] = lastCall(onViewportChange);
    const [west, south, east, north] = String(bbox).split(",").map(Number);
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    expect(zoom).toBe(16);
  });

  it("renders heatmap visuals and opens cell details", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");

    render(
      <MapSurface
        {...defaultProps}
        heatmapCells={[heatmapCell]}
        loading={false}
      />,
    );

    const point = await screen.findByRole("button", {
      name: "查看热力点 cell-1",
    });
    expect(point).toHaveAttribute("data-testid", "heatmap-point");
    expect(point).toHaveStyle({
      backgroundColor: "rgb(239, 68, 68)",
      opacity: "0.18",
    });

    fireEvent.click(point);

    expect(screen.getByTestId("heatmap-cell-details")).toBeInTheDocument();
    expect(screen.getByText("NOISE")).toBeInTheDocument();
    expect(screen.getByText("压力 100")).toBeInTheDocument();
    expect(screen.getByText("置信度 5%")).toBeInTheDocument();
    expect(screen.getByText("18 条反馈")).toBeInTheDocument();
  });

  it("publishes changed zoom and keyboard-panned viewports", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const onViewportChange = vi.fn();

    render(
      <MapSurface
        {...defaultProps}
        heatmapCells={[]}
        loading={false}
        onViewportChange={onViewportChange}
      />,
    );

    const offlineMap = await screen.findByTestId("offline-map");
    await waitFor(() => expect(onViewportChange).toHaveBeenCalled());
    const initialBbox = lastCall(onViewportChange)[0];

    fireEvent.click(screen.getByRole("button", { name: "放大地图" }));
    await waitFor(() =>
      expect(lastCall(onViewportChange)[1]).toBe(17),
    );

    fireEvent.keyDown(offlineMap, { key: "ArrowRight" });
    await waitFor(() =>
      expect(lastCall(onViewportChange)[0]).not.toBe(initialBbox),
    );
  });

  it("falls back offline when the AMap script reports an error", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "browser-key");

    render(
      <MapSurface
        {...defaultProps}
        heatmapCells={[]}
        loading={false}
      />,
    );
    const script = document.querySelector<HTMLScriptElement>(
      "#commute-mood-amap-js",
    );

    script?.dispatchEvent(new Event("error"));

    expect(await screen.findByText("离线演示地图")).toBeInTheDocument();
  });

  it("does not rebuild an AMap instance when heatmap props change", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "browser-key");
    const constructorSpy = vi.fn();
    const destroySpy = vi.fn();
    const listeners = new Map<string, () => void>();
    const namespace: AMapNamespaceLike = {
      Map: class {
        constructor() {
          constructorSpy();
        }
        destroy = destroySpy;
        getBounds() {
          return {
            getNorthEast: () => ({ lng: 120.352, lat: 31.498 }),
            getSouthWest: () => ({ lng: 120.324, lat: 31.478 }),
          };
        }
        getZoom() {
          return 16;
        }
        getCenter() {
          return { lng: 120.338, lat: 31.488 };
        }
        setCenter() {}
        setZoom() {}
        lngLatToContainer() {
          return { x: 480, y: 300 };
        }
        containerToLngLat() {
          return { getLng: () => 120.338, getLat: () => 31.488 };
        }
        off(eventName: string) {
          listeners.delete(eventName);
        }
        on(eventName: string, listener: () => void) {
          listeners.set(eventName, listener);
        }
      },
      Bounds: class {
        constructor(
          public sw: [number, number],
          public ne: [number, number],
        ) {}
        getSouthWest() {
          return { lng: this.sw[0], lat: this.sw[1] };
        }
        getNorthEast() {
          return { lng: this.ne[0], lat: this.ne[1] };
        }
      },
    };
    window.AMap = namespace;

    const { rerender, unmount } = render(
      <MapSurface
        {...defaultProps}
        heatmapCells={[]}
        loading={false}
      />,
    );
    expect(await screen.findByText("高德地图")).toBeInTheDocument();

    rerender(
      <MapSurface
        {...defaultProps}
        heatmapCells={[heatmapCell]}
        loading={false}
      />,
    );

    expect(constructorSpy).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "查看热力点 cell-1" }),
    ).toBeInTheDocument();

    unmount();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("announces heatmap loading without hiding the map", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");

    render(
      <MapSurface
        {...defaultProps}
        heatmapCells={[]}
        loading
      />,
    );

    expect(await screen.findByText("正在更新情绪热力图")).toBeInTheDocument();
    expect(screen.getByTestId("offline-map")).toBeInTheDocument();
  });

  it("shows feedback panel on long press via AMap and submits feedback", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "browser-key");
    const onFeedbackSubmit = vi
      .fn<(draft: MapFeedbackDraft) => Promise<void>>()
      .mockResolvedValue(undefined);

    const listeners = new Map<string, () => void>();
    const namespace: AMapNamespaceLike = {
      Map: class {
        destroy() {}
        getBounds() {
          return {
            getNorthEast: () => ({ lng: 120.352, lat: 31.498 }),
            getSouthWest: () => ({ lng: 120.324, lat: 31.478 }),
          };
        }
        getZoom() { return 16; }
        getCenter() { return { lng: 120.338, lat: 31.488 }; }
        setCenter() {}
        setZoom() {}
        lngLatToContainer() { return { x: 380, y: 250 }; }
        containerToLngLat() {
          // Return a point inside campus bounds
          return { getLng: () => 120.338, getLat: () => 31.488 };
        }
        off(eventName: string) { listeners.delete(eventName); }
        on(eventName: string, listener: () => void) { listeners.set(eventName, listener); }
      },
      Bounds: class {
        constructor(public sw: [number, number], public ne: [number, number]) {}
        getSouthWest() { return { lng: this.sw[0], lat: this.sw[1] }; }
        getNorthEast() { return { lng: this.ne[0], lat: this.ne[1] }; }
      },
    };
    window.AMap = namespace;

    render(
      <MapSurface
        {...defaultProps}
        heatmapCells={[]}
        loading={false}
        onFeedbackSubmit={onFeedbackSubmit}
      />,
    );

    // Wait for AMap adapter to initialize with real timers
    expect(await screen.findByText("高德地图")).toBeInTheDocument();

    // Now switch to fake timers for long press simulation
    vi.useFakeTimers();

    const section = screen.getByLabelText("校园通勤情绪地图");
    const mapCanvas = screen.getByTestId("map-canvas");
    vi.spyOn(mapCanvas, "getBoundingClientRect").mockReturnValue({
      bottom: 650,
      height: 600,
      left: 100,
      right: 1060,
      top: 50,
      width: 960,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });

    // Simulate long press: pointer down then wait 650ms
    await act(async () => {
      const pointerDown = new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 480,
        clientY: 300,
      });
      Object.defineProperty(pointerDown, "pointerId", { value: 1 });
      fireEvent(section, pointerDown);
    });

    // Advance timer past 600ms threshold wrapped in act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    // Feedback panel should appear
    const panel = screen.getByTestId("feedback-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveStyle({ left: "380px", top: "250px" });

    // Select stress level and tag
    fireEvent.click(screen.getByRole("button", { name: /压力 75/ }));
    fireEvent.click(screen.getByRole("button", { name: /原因 拥挤/ }));

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    // Allow async submit to resolve
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(onFeedbackSubmit).toHaveBeenCalledTimes(1);
    const draft = onFeedbackSubmit.mock.calls[0][0];
    expect(draft.stressLevel).toBe(75);
    expect(draft.tag).toBe("CROWD");
    expect(draft.location).toHaveProperty("longitude");
    expect(draft.location).toHaveProperty("latitude");

    vi.useRealTimers();
  }, 10_000);

  it("renders route overlay and legend when routes are provided", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");

    const routes: ScoredRoute[] = [
      {
        id: "route-fast",
        label: "最快路线",
        distanceMeters: 850,
        durationSeconds: 600,
        stressExposure: 45.2,
        stressScore: 38.4,
        confidence: 0.72,
        fastest: true,
        leastStressful: false,
        polyline: [
          { longitude: 120.3345, latitude: 31.492 },
          { longitude: 120.3415, latitude: 31.4845 },
        ],
      },
    ];

    render(
      <MapSurface
        {...defaultProps}
        heatmapCells={[]}
        loading={false}
        routes={routes}
        selectedRouteId="route-fast"
      />,
    );

    expect(await screen.findByTestId("route-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("route-legend")).toBeInTheDocument();
    expect(screen.getByText("最快路线")).toBeInTheDocument();
  }, 15_000);
});
