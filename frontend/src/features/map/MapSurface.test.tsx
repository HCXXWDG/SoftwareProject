import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeatmapCell, MapFeedbackDraft, ScoredRoute } from "../../types";
import { SERVICE_AREA, DEFAULT_ORIGIN, DEFAULT_DESTINATION } from "../../config/serviceArea";
import {
  resetAMapLoaderForTests,
  type AMapNamespaceLike,
} from "./amapLoader";
import { MapSurface, type MapSurfaceProps } from "./MapSurface";

const heatmapCell: HeatmapCell = {
  cellId: "cell-1",
  center: {
    longitude: SERVICE_AREA.center.longitude,
    latitude: SERVICE_AREA.center.latitude,
  },
  score: 100,
  confidence: 0.05,
  count: 18,
  dominantTag: "NOISE",
};

const campusViewportConstraint = {
  // A deliberately small test constraint exercises boundary enforcement independently of the district overview.
  center: SERVICE_AREA.center,
  bounds: {
    west: SERVICE_AREA.center.longitude - 0.013245,
    south: SERVICE_AREA.center.latitude - 0.006522,
    east: SERVICE_AREA.center.longitude + 0.005545,
    north: SERVICE_AREA.center.latitude + 0.014868,
  },
  minZoom: 15,
  maxZoom: 18,
  defaultZoom: 16,
};

const campusOrigin = { longitude: SERVICE_AREA.center.longitude - 0.001, latitude: SERVICE_AREA.center.latitude - 0.002 };
const campusDestination = { longitude: SERVICE_AREA.center.longitude + 0.001, latitude: SERVICE_AREA.center.latitude + 0.002 };

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
    expect(zoom).toBe(SERVICE_AREA.defaultZoom);
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
      name: "热力点 压力100 NOISE",
    });
    expect(point).toHaveAttribute("data-testid", "heatmap-point");
    // 热点用径向渐变呈现压力色（score 100 → rgb(220, 38, 38)），透明度由置信度决定
    const halo = within(point).getByTestId("heatmap-point-halo");
    expect(halo).toHaveStyle({ opacity: "0.18" });
    expect(halo.style.background).toContain("rgb(220, 38, 38)");

    fireEvent.click(point);

    expect(screen.getByTestId("heatmap-cell-details")).toBeInTheDocument();
    expect(screen.getByText("噪音")).toBeInTheDocument();
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
      expect(lastCall(onViewportChange)[1]).toBe(SERVICE_AREA.defaultZoom + 1),
    );

    fireEvent.keyDown(offlineMap, { key: "ArrowRight" });
    await waitFor(() =>
      expect(lastCall(onViewportChange)[0]).not.toBe(initialBbox),
    );
  });

  it("pans from a heatmap target without opening details or feedback", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const onViewportChange = vi.fn();
    render(<MapSurface {...defaultProps} heatmapCells={[heatmapCell]} loading={false}
      viewportConstraint={campusViewportConstraint} onViewportChange={onViewportChange} />);
    await screen.findByTestId("offline-map");
    await waitFor(() => expect(onViewportChange).toHaveBeenCalled());
    const before = lastCall(onViewportChange)[0];
    const point = screen.getByTestId("heatmap-point");
    const surface = screen.getByLabelText("心途——通勤情绪地图");
    fireEvent(point, new MouseEvent("pointerdown", { bubbles: true, clientX: 480, clientY: 300 }));
    fireEvent(surface, new MouseEvent("pointermove", { bubbles: true, clientX: 560, clientY: 320 }));
    fireEvent(surface, new MouseEvent("pointerup", { bubbles: true, clientX: 560, clientY: 320 }));
    fireEvent.click(point, { detail: 1 });
    await waitFor(() => expect(lastCall(onViewportChange)[0]).not.toBe(before));
    expect(screen.queryByTestId("heatmap-cell-details")).not.toBeInTheDocument();
    expect(screen.queryByTestId("feedback-panel")).not.toBeInTheDocument();
  });

  it("ignores right-button drags and keeps the primary heat gesture when another touch ends", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const onViewportChange = vi.fn();
    render(<MapSurface {...defaultProps} heatmapCells={[heatmapCell]} loading={false}
      viewportConstraint={campusViewportConstraint} onViewportChange={onViewportChange} />);
    await screen.findByTestId("offline-map");
    await waitFor(() => expect(onViewportChange).toHaveBeenCalled());
    const before = lastCall(onViewportChange)[0];
    const point = screen.getByTestId("heatmap-point");
    const surface = screen.getByLabelText("心途——通勤情绪地图");
    const pointer = (type: string, target: HTMLElement, id: number, x: number, button = 0, primary = true) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 300, button });
      Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: primary } });
      fireEvent(target, event);
    };
    pointer("pointerdown", point, 1, 480, 2);
    pointer("pointermove", surface, 1, 540, 2);
    pointer("pointerup", surface, 1, 540, 2);
    expect(lastCall(onViewportChange)[0]).toBe(before);
    pointer("pointerdown", point, 1, 480);
    pointer("pointerdown", point, 2, 500, 0, false);
    pointer("pointerup", surface, 2, 500, 0, false);
    pointer("pointermove", surface, 1, 540);
    pointer("pointerup", surface, 1, 540);
    await waitFor(() => expect(lastCall(onViewportChange)[0]).not.toBe(before));
    expect(screen.queryByTestId("feedback-panel")).not.toBeInTheDocument();
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
            getNorthEast: () => ({ lng: SERVICE_AREA.bounds.east, lat: SERVICE_AREA.bounds.north }),
            getSouthWest: () => ({ lng: SERVICE_AREA.bounds.west, lat: SERVICE_AREA.bounds.south }),
          };
        }
        getZoom() {
          return 16;
        }
        getCenter() {
          return { lng: SERVICE_AREA.center.longitude, lat: SERVICE_AREA.center.latitude };
        }
        setCenter() {}
        setZoom() {}
        lngLatToContainer() {
          return { x: 480, y: 300 };
        }
        containerToLngLat() {
          return { getLng: () => SERVICE_AREA.center.longitude, getLat: () => SERVICE_AREA.center.latitude };
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
      await screen.findByRole("button", { name: "热力点 压力100 NOISE" }),
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
            getNorthEast: () => ({ lng: SERVICE_AREA.bounds.east, lat: SERVICE_AREA.bounds.north }),
            getSouthWest: () => ({ lng: SERVICE_AREA.bounds.west, lat: SERVICE_AREA.bounds.south }),
          };
        }
        getZoom() { return 16; }
        getCenter() { return { lng: SERVICE_AREA.center.longitude, lat: SERVICE_AREA.center.latitude }; }
        setCenter() {}
        setZoom() {}
        lngLatToContainer() { return { x: 380, y: 250 }; }
        containerToLngLat() {
          // Return a point inside campus bounds
          return { getLng: () => SERVICE_AREA.center.longitude, getLat: () => SERVICE_AREA.center.latitude };
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

    const section = screen.getByLabelText("心途——通勤情绪地图");
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
          { longitude: DEFAULT_ORIGIN.point.longitude, latitude: DEFAULT_ORIGIN.point.latitude },
          { longitude: DEFAULT_DESTINATION.point.longitude, latitude: DEFAULT_DESTINATION.point.latitude },
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

describe("MapSurface campus bounds", () => {
  it("uses the campus default zoom and renders fixed endpoint markers", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const onViewportChange = vi.fn();

    render(
      <MapSurface
        {...defaultProps}
        heatmapCells={[]}
        loading={false}
        origin={campusOrigin}
        destination={campusDestination}
        viewportConstraint={campusViewportConstraint}
        onViewportChange={onViewportChange}
      />,
    );

    await screen.findByTestId("offline-map");
    await waitFor(() => expect(onViewportChange).toHaveBeenCalled());
    expect(lastCall(onViewportChange)[1]).toBe(16);

    expect(screen.getByTestId("endpoint-markers")).toBeInTheDocument();
    expect(screen.getByTestId("endpoint-origin")).toBeInTheDocument();
    expect(screen.getByTestId("endpoint-destination")).toBeInTheDocument();
  });

  it("clamps offline zoom to the campus range and rejects long-press outside bounds", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const onViewportChange = vi.fn();

    render(
      <MapSurface
        {...defaultProps}
        heatmapCells={[]}
        loading={false}
        viewportConstraint={campusViewportConstraint}
        onViewportChange={onViewportChange}
      />,
    );

    const offlineMap = await screen.findByTestId("offline-map");
    await waitFor(() => expect(onViewportChange).toHaveBeenCalled());

    // Zoom out repeatedly — should never fall below minZoom 15
    for (let i = 0; i < 6; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "缩小地图" }));
    }
    await waitFor(() =>
      expect(lastCall(onViewportChange)[1]).toBeGreaterThanOrEqual(15),
    );

    // Long-press near the top-left corner (outside the campus bounds) should
    // not open the feedback panel because the projected GeoPoint is far away.
    const section = screen.getByLabelText("心途——通勤情绪地图");
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

    fireEvent(
      section,
      new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 110,
        clientY: 60,
      }),
    );

    await waitFor(() => {
      const panel = screen.queryByTestId("feedback-panel");
      expect(panel).not.toBeInTheDocument();
    });

    // A press near the map center (within bounds) should open the panel.
    vi.useFakeTimers();
    act(() => {
      fireEvent(
        section,
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 480,
          clientY: 300,
        }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(screen.getByTestId("feedback-panel")).toBeInTheDocument();
    vi.useRealTimers();

    // silence unused var lint in some toolchains
    expect(offlineMap).toBeInTheDocument();
  });
});

describe("MapSurface explicit feedback and recovery", () => {
  it("selects the current map center as an endpoint without opening feedback", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const onSelect = vi.fn();
    render(<MapSurface {...defaultProps} heatmapCells={[]} loading={false} feedbackEnabled={false}
      viewportConstraint={campusViewportConstraint} pointSelection={{ label: "使用此位置作为起点", onSelect }} />);
    const map = await screen.findByTestId("offline-map");
    const button = screen.getByRole("button", { name: "使用此位置作为起点" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.keyDown(map, { key: "ArrowLeft" });
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
    const point = onSelect.mock.calls[0][0];
    expect(point.longitude).toBeLessThan(campusViewportConstraint.center.longitude);
    expect(point.latitude).toBeCloseTo(campusViewportConstraint.center.latitude, 5);
    expect(screen.queryByRole("button", { name: "记录此处感受" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("feedback-panel")).not.toBeInTheDocument();
  });

  it("uses the currently panned map center and preserves the failed draft for retry", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const onViewportChange = vi.fn();
    const onFeedbackSubmit = vi.fn<MapSurfaceProps["onFeedbackSubmit"]>()
      .mockRejectedValueOnce(new Error("请稍后重试"))
      .mockResolvedValueOnce({ status: "created" });
    render(<MapSurface {...defaultProps} heatmapCells={[]} loading={false}
      viewportConstraint={campusViewportConstraint} onViewportChange={onViewportChange}
      onFeedbackSubmit={onFeedbackSubmit} />);
    const map = await screen.findByTestId("offline-map");
    await waitFor(() => expect(onViewportChange).toHaveBeenCalled());
    const originalBbox = lastCall(onViewportChange)[0];
    fireEvent.keyDown(map, { key: "ArrowLeft" });
    await waitFor(() => expect(lastCall(onViewportChange)[0]).not.toBe(originalBbox));
    fireEvent.click(screen.getByRole("button", { name: "记录此处感受" }));
    fireEvent.click(screen.getByRole("button", { name: "压力 25 还好" }));
    fireEvent.click(screen.getByRole("button", { name: "原因 安静" }));
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请稍后重试");
    expect(screen.getByRole("button", { name: "压力 25 还好" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "原因 安静" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "记录此处感受" })).toBeDisabled();
    expect(onFeedbackSubmit.mock.calls[0][0].location.longitude).toBeLessThan(campusViewportConstraint.center.longitude);
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onFeedbackSubmit.mock.calls[1][0]).toEqual(onFeedbackSubmit.mock.calls[0][0]);
  });

  it("keeps a duplicate receipt visible without animation and clears it for a new draft", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const onFeedbackSubmit = vi.fn<MapSurfaceProps["onFeedbackSubmit"]>()
      .mockResolvedValue({ status: "duplicate" });
    render(<MapSurface {...defaultProps} heatmapCells={[]} loading={false} onFeedbackSubmit={onFeedbackSubmit} />);
    await screen.findByTestId("offline-map");
    const entry = screen.getByRole("button", { name: "记录此处感受" });
    await waitFor(() => expect(entry).toBeEnabled());
    fireEvent.click(entry);
    fireEvent.click(screen.getByRole("button", { name: "压力 0 轻松" }));
    fireEvent.click(screen.getByRole("button", { name: "原因 开阔" }));
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await screen.findByText(/已记录/);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("emoji-fountain")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    expect(onFeedbackSubmit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "关闭反馈面板" }));
    fireEvent.click(entry);
    expect(screen.queryByText(/已记录/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交反馈" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "原因 开阔" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the measured dialog inside a narrow map after resizing", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const size = { width: 390, height: 600 };
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const map = this.dataset.testid === "map-canvas";
      if (!map && this.dataset.testid !== "feedback-panel") return originalRect.call(this);
      const width = map ? size.width : 300;
      const height = map ? size.height : 350;
      return { x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) };
    });
    try {
      render(<MapSurface {...defaultProps} heatmapCells={[]} loading={false} />);
      await screen.findByTestId("offline-map");
      const entry = screen.getByRole("button", { name: "记录此处感受" });
      await waitFor(() => expect(entry).toBeEnabled());
      fireEvent.click(entry);
      const panel = screen.getByRole("dialog");
      const expectInside = () => {
        expect(Number.parseFloat(panel.style.left)).toBeGreaterThanOrEqual(8);
        expect(Number.parseFloat(panel.style.left) + 300).toBeLessThanOrEqual(size.width - 8);
        expect(Number.parseFloat(panel.style.top)).toBeGreaterThanOrEqual(8);
        expect(Number.parseFloat(panel.style.top) + 350).toBeLessThanOrEqual(size.height - 34);
      };
      expectInside();
      size.width = 320; size.height = 420;
      fireEvent(window, new Event("resize"));
      expectInside();
    } finally { measure.mockRestore(); }
  });

  it("disables the explicit action while feedback capability is unavailable", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    render(<MapSurface {...defaultProps} heatmapCells={[]} loading={false} feedbackEnabled={false} />);
    await screen.findByTestId("offline-map");
    const entry = screen.getByRole("button", { name: "记录此处感受" });
    expect(entry).toBeDisabled();
    fireEvent.click(entry);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
