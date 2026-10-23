import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SERVICE_AREA, SERVICE_VIEWPORT_CONSTRAINT } from "../../config/serviceArea";
import { resetAMapLoaderForTests, type AMapNamespaceLike } from "./amapLoader";
import { MapSurface, type MapSurfaceProps } from "./MapSurface";

const props: MapSurfaceProps = {
  heatmapCells: [], routes: [], loading: false,
  onFeedbackSubmit: async () => {}, onRouteSelect: () => {}, onViewportChange: () => {},
  viewportConstraint: SERVICE_VIEWPORT_CONSTRAINT,
};

function installProvider() {
  vi.stubEnv("VITE_AMAP_JS_KEY", "browser-key");
  const listeners = new Map<string, () => void>();
  const state = { zoom: Number(SERVICE_AREA.defaultZoom), longitude: SERVICE_AREA.center.longitude, latitude: SERVICE_AREA.center.latitude, x: 380, y: 250 };
  const setZoom = vi.fn((zoom: number) => { state.zoom = zoom; listeners.get("zoomend")?.(); });
  const setCenter = vi.fn(([longitude, latitude]: [number, number]) => { state.longitude = longitude; state.latitude = latitude; listeners.get("moveend")?.(); });
  const namespace: AMapNamespaceLike = {
    Map: class {
      destroy() {}
      getBounds() { return {
        getNorthEast: () => ({ lng: SERVICE_AREA.bounds.east, lat: SERVICE_AREA.bounds.north }),
        getSouthWest: () => ({ lng: SERVICE_AREA.bounds.west, lat: SERVICE_AREA.bounds.south }),
      }; }
      getZoom() { return state.zoom; }
      getCenter() { return { lng: state.longitude, lat: state.latitude }; }
      setCenter = setCenter;
      setZoom = setZoom;
      lngLatToContainer() { return { x: state.x, y: state.y }; }
      containerToLngLat() { return { lng: state.longitude, lat: state.latitude }; }
      off(name: string) { listeners.delete(name); }
      on(name: string, callback: () => void) { listeners.set(name, callback); }
    },
    Bounds: class {
      constructor(public sw: [number, number], public ne: [number, number]) {}
      getSouthWest() { return { lng: this.sw[0], lat: this.sw[1] }; }
      getNorthEast() { return { lng: this.ne[0], lat: this.ne[1] }; }
    },
  };
  window.AMap = namespace;
  return { state, setZoom, setCenter, listeners };
}

function pointer(target: HTMLElement, type: string, { x = 300, y = 250, id = 1, button = 0, primary = true } = {}) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button });
  Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: primary } });
  fireEvent(target, event);
}

async function providerCanvas() {
  await screen.findByText("高德地图");
  const host = screen.getByTestId("map-canvas");
  const canvas = document.createElement("div");
  for (const name of ["pointerdown", "pointermove", "pointerup"]) canvas.addEventListener(name, event => event.stopPropagation());
  host.append(canvas);
  return canvas;
}

afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); resetAMapLoaderForTests();
});

describe("shared map controls and provider gesture boundary", () => {
  it("offers bounded online zoom controls, keyboard movement and a reset to the district view", async () => {
    const provider = installProvider();
    render(<MapSurface {...props} />);
    await providerCanvas();
    const canvas = screen.getByTestId("map-canvas");
    expect(canvas).toHaveAttribute("tabindex", "0");
    fireEvent.click(screen.getByRole("button", { name: "放大地图" }));
    expect(provider.setZoom).toHaveBeenLastCalledWith(SERVICE_AREA.defaultZoom + 1);
    fireEvent.keyDown(canvas, { key: "+" });
    expect(provider.setZoom).toHaveBeenLastCalledWith(SERVICE_AREA.defaultZoom + 2);
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole("button", { name: "缩小地图" }));
    expect(provider.state.zoom).toBe(SERVICE_AREA.minZoom);
    expect(screen.getByRole("button", { name: "缩小地图" })).toBeDisabled();
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(provider.setCenter).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "重置视野" }));
    expect(provider.setCenter).toHaveBeenLastCalledWith([SERVICE_AREA.center.longitude, SERVICE_AREA.center.latitude]);
    expect(provider.setZoom).toHaveBeenLastCalledWith(SERVICE_AREA.defaultZoom);
  });

  it("resets the offline map after both panning and zooming", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const onViewportChange = vi.fn();
    render(<MapSurface {...props} onViewportChange={onViewportChange} />);
    const offline = await screen.findByTestId("offline-map");
    await waitFor(() => expect(onViewportChange).toHaveBeenCalled());
    const initial = onViewportChange.mock.calls.at(-1);
    fireEvent.click(screen.getByRole("button", { name: "放大地图" }));
    fireEvent.keyDown(offline, { key: "ArrowRight" });
    expect(onViewportChange.mock.calls.at(-1)).not.toEqual(initial);
    fireEvent.click(screen.getByRole("button", { name: "重置视野" }));
    await waitFor(() => expect(onViewportChange.mock.calls.at(-1)).toEqual(initial));
    expect(screen.getAllByRole("button", { name: "放大地图" })).toHaveLength(1);
  });

  it("restores focus without scrolling the surrounding page when feedback closes", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    render(<MapSurface {...props} />);
    await screen.findByTestId("offline-map");
    const entry = screen.getByRole("button", { name: "记录此处感受" });
    await waitFor(() => expect(entry).toBeEnabled());
    entry.focus();
    fireEvent.click(entry);
    const restoreFocus = vi.spyOn(entry, "focus");
    fireEvent.click(screen.getByRole("button", { name: "关闭反馈面板" }));
    expect(restoreFocus).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it("recognizes a long press before the provider stops bubbling and keeps its geographic marker anchored", async () => {
    const provider = installProvider();
    const onViewportChange = vi.fn();
    render(<MapSurface {...props} onViewportChange={onViewportChange} />);
    const canvas = await providerCanvas();
    vi.useFakeTimers();
    pointer(canvas, "pointerdown");
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const marker = screen.getByRole("img", { name: "反馈位置" });
    expect(marker).toHaveStyle({ left: "380px", top: "250px" });
    expect(screen.getByRole("button", { name: "放大地图" })).toBeDisabled();
    const queryCount = onViewportChange.mock.calls.length;
    act(() => { provider.state.x = 320; provider.state.y = 280; provider.listeners.get("mapmove")?.(); });
    expect(marker).toHaveStyle({ left: "320px", top: "280px" });
    expect(onViewportChange).toHaveBeenCalledTimes(queryCount);
    act(() => provider.listeners.get("moveend")?.());
    expect(onViewportChange).toHaveBeenCalledTimes(queryCount + 1);
  });

  it("cancels provider long presses after a drag, a second touch or pointer cancellation", async () => {
    installProvider();
    render(<MapSurface {...props} />);
    const canvas = await providerCanvas();
    vi.useFakeTimers();
    pointer(canvas, "pointerdown"); pointer(canvas, "pointermove", { x: 330 });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    pointer(canvas, "pointerup");
    pointer(canvas, "pointerdown"); pointer(canvas, "pointerdown", { id: 2, primary: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    pointer(canvas, "pointerdown"); pointer(canvas, "pointercancel");
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    pointer(canvas, "pointerdown", { button: 2 });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancels a pending provider long press on unmount", async () => {
    installProvider();
    const onFeedbackOpen = vi.fn();
    const { unmount } = render(<MapSurface {...props} onFeedbackOpen={onFeedbackOpen} />);
    const canvas = await providerCanvas();
    vi.useFakeTimers();
    pointer(canvas, "pointerdown");
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(onFeedbackOpen).not.toHaveBeenCalled();
  });
});
