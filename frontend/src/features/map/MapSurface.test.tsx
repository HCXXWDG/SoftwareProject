import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeatmapCell } from "../../types";
import {
  resetAMapLoaderForTests,
  type AMapNamespaceLike,
} from "./amapLoader";
import { MapSurface } from "./MapSurface";

const heatmapCell: HeatmapCell = {
  cellId: "cell-1",
  center: {
    longitude: 116.4,
    latitude: 39.91,
  },
  score: 100,
  confidence: 0.05,
  count: 18,
  dominantTag: "NOISE",
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
        heatmapCells={[heatmapCell]}
        routes={[]}
        loading={false}
        onFeedbackSubmit={vi.fn()}
        onRouteSelect={vi.fn()}
        onViewportChange={onViewportChange}
      />,
    );

    expect(await screen.findByText("离线演示地图")).toBeInTheDocument();
    await waitFor(() => expect(onViewportChange).toHaveBeenCalled());

    const [bbox, zoom] = lastCall(onViewportChange);
    const [west, south, east, north] = String(bbox).split(",").map(Number);
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    expect(zoom).toBe(14);
  });

  it("renders heatmap visuals and opens cell details", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");

    render(
      <MapSurface
        heatmapCells={[heatmapCell]}
        routes={[]}
        loading={false}
        onFeedbackSubmit={vi.fn()}
        onRouteSelect={vi.fn()}
        onViewportChange={vi.fn()}
      />,
    );

    const point = await screen.findByRole("button", {
      name: "查看热力点 cell-1",
    });
    expect(point).toHaveStyle({
      backgroundColor: "rgb(239, 68, 68)",
      opacity: "0.18",
    });

    fireEvent.click(point);

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
        heatmapCells={[]}
        routes={[]}
        loading={false}
        onFeedbackSubmit={vi.fn()}
        onRouteSelect={vi.fn()}
        onViewportChange={onViewportChange}
      />,
    );

    const offlineMap = await screen.findByTestId("offline-map");
    await waitFor(() => expect(onViewportChange).toHaveBeenCalled());
    const initialBbox = lastCall(onViewportChange)[0];

    fireEvent.click(screen.getByRole("button", { name: "放大地图" }));
    await waitFor(() =>
      expect(lastCall(onViewportChange)[1]).toBe(15),
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
        heatmapCells={[]}
        routes={[]}
        loading={false}
        onFeedbackSubmit={vi.fn()}
        onRouteSelect={vi.fn()}
        onViewportChange={vi.fn()}
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
            getNorthEast: () => ({ lng: 116.41, lat: 39.92 }),
            getSouthWest: () => ({ lng: 116.39, lat: 39.9 }),
          };
        }
        getZoom() {
          return 14;
        }
        lngLatToContainer() {
          return { x: 480, y: 300 };
        }
        off(eventName: string) {
          listeners.delete(eventName);
        }
        on(eventName: string, listener: () => void) {
          listeners.set(eventName, listener);
        }
      },
    };
    window.AMap = namespace;

    const { rerender, unmount } = render(
      <MapSurface
        heatmapCells={[]}
        routes={[]}
        loading={false}
        onFeedbackSubmit={vi.fn()}
        onRouteSelect={vi.fn()}
        onViewportChange={vi.fn()}
      />,
    );
    expect(await screen.findByText("高德地图")).toBeInTheDocument();

    rerender(
      <MapSurface
        heatmapCells={[heatmapCell]}
        routes={[]}
        loading={false}
        onFeedbackSubmit={vi.fn()}
        onRouteSelect={vi.fn()}
        onViewportChange={vi.fn()}
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
        heatmapCells={[]}
        routes={[]}
        loading
        onFeedbackSubmit={vi.fn()}
        onRouteSelect={vi.fn()}
        onViewportChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("正在更新情绪热力图")).toBeInTheDocument();
    expect(screen.getByTestId("offline-map")).toBeInTheDocument();
  });
});
