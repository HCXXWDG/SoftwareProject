import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPUS } from "../../config/campus";
import type { MapFeedbackDraft } from "../../types";
import { resetAMapLoaderForTests, type AMapNamespaceLike } from "./amapLoader";
import { MapSurface, type MapSurfaceProps } from "./MapSurface";

function installAMap() {
  const listeners = new Map<string, () => void>();
  const namespace: AMapNamespaceLike = {
    Map: class {
      destroy() {}
      getBounds() {
        return {
          getNorthEast: () => ({ lng: CAMPUS.bounds.east, lat: CAMPUS.bounds.north }),
          getSouthWest: () => ({ lng: CAMPUS.bounds.west, lat: CAMPUS.bounds.south }),
        };
      }
      getZoom() { return 16; }
      getCenter() { return { lng: CAMPUS.center.longitude, lat: CAMPUS.center.latitude }; }
      setCenter() {}
      setZoom() {}
      lngLatToContainer() { return { x: 380, y: 250 }; }
      containerToLngLat() {
        return { getLng: () => CAMPUS.center.longitude, getLat: () => CAMPUS.center.latitude };
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
}

function makeProps(overrides: Partial<MapSurfaceProps> = {}): MapSurfaceProps {
  return {
    heatmapCells: [],
    routes: [],
    loading: false,
    onFeedbackSubmit: vi.fn<(draft: MapFeedbackDraft) => Promise<void>>().mockResolvedValue(),
    onRouteSelect: vi.fn(),
    onViewportChange: vi.fn(),
    ...overrides,
  };
}

async function readyMap(props: MapSurfaceProps) {
  const result = render(<MapSurface {...props} />);
  await screen.findByText("高德地图");
  vi.spyOn(screen.getByTestId("map-canvas"), "getBoundingClientRect").mockReturnValue({
    bottom: 650, height: 600, left: 100, right: 1060,
    top: 50, width: 960, x: 100, y: 50, toJSON: () => ({}),
  });
  vi.useFakeTimers();
  return result;
}

async function longPress(clientX = 480, clientY = 300) {
  const event = new MouseEvent("pointerdown", { bubbles: true, clientX, clientY });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(screen.getByLabelText("校园通勤情绪地图"), event);
  await act(async () => { await vi.advanceTimersByTimeAsync(650); });
}

function selectDraft() {
  fireEvent.click(screen.getByRole("button", { name: "压力 75 烦躁" }));
  fireEvent.click(screen.getByRole("button", { name: "原因 拥挤" }));
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_AMAP_JS_KEY", "browser-key");
  installAMap();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetAMapLoaderForTests();
});

describe("MapSurface feedback submission boundary", () => {
  it("keeps an open draft anchored while submitting and after a failed submission", async () => {
    let rejectSubmission!: (error: Error) => void;
    const onFeedbackSubmit = vi.fn<MapSurfaceProps["onFeedbackSubmit"]>()
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectSubmission = reject; }))
      .mockResolvedValueOnce({ status: "created" });
    await readyMap(makeProps({ onFeedbackSubmit }));
    await longPress();
    selectDraft();
    await submit();
    await longPress(680, 400);
    expect(screen.getByTestId("feedback-panel")).toHaveStyle({ left: "380px", top: "250px" });

    await act(async () => { rejectSubmission(new Error("请重试。")); });
    await longPress(680, 400);
    expect(screen.getByTestId("feedback-panel")).toHaveStyle({ left: "380px", top: "250px" });
    await submit();
    expect(onFeedbackSubmit.mock.calls[1][0]).toEqual(onFeedbackSubmit.mock.calls[0][0]);
  });

  it("retains the selected draft and location on failure and allows retry", async () => {
    const onFeedbackSubmit = vi.fn<MapSurfaceProps["onFeedbackSubmit"]>()
      .mockRejectedValueOnce(new Error("反馈服务暂不可用，请重试。"))
      .mockResolvedValueOnce({ status: "created" });
    await readyMap(makeProps({ onFeedbackSubmit }));
    await longPress();
    selectDraft();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent("反馈服务暂不可用，请重试。");
    expect(screen.getByTestId("feedback-panel")).toHaveStyle({ left: "380px", top: "250px" });
    expect(screen.getByRole("button", { name: "压力 75 烦躁" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "原因 拥挤" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "提交反馈" })).toBeEnabled();
    expect(screen.queryByTestId("emoji-fountain")).not.toBeInTheDocument();

    await submit();

    expect(onFeedbackSubmit).toHaveBeenCalledTimes(2);
    expect(onFeedbackSubmit.mock.calls[1][0]).toEqual(onFeedbackSubmit.mock.calls[0][0]);
    expect(onFeedbackSubmit.mock.calls[1][0]).toEqual({
      location: CAMPUS.center, stressLevel: 75, tag: "CROWD",
    });
    expect(screen.queryByTestId("feedback-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("emoji-fountain")).toHaveStyle({ left: "380px", top: "250px" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closes a successful created submission and shows its fountain", async () => {
    const onFeedbackSubmit = vi.fn<MapSurfaceProps["onFeedbackSubmit"]>().mockResolvedValue({ status: "created" });
    await readyMap(makeProps({ onFeedbackSubmit }));
    await longPress();
    selectDraft();
    await submit();

    expect(onFeedbackSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("feedback-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("emoji-fountain")).toHaveTextContent("😟");
  });

  it("closes an accepted duplicate without a fountain", async () => {
    const onFeedbackSubmit = vi.fn<MapSurfaceProps["onFeedbackSubmit"]>().mockResolvedValue({ status: "duplicate" });
    await readyMap(makeProps({ onFeedbackSubmit }));
    await longPress();
    selectDraft();
    await submit();

    expect(onFeedbackSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("feedback-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("emoji-fountain")).not.toBeInTheDocument();
  });

  it("does not offer long-press submission when feedback is unavailable", async () => {
    const onFeedbackSubmit = vi.fn<MapSurfaceProps["onFeedbackSubmit"]>();
    await readyMap(makeProps({ onFeedbackSubmit, feedbackEnabled: false }));
    await longPress();

    expect(screen.queryByTestId("feedback-panel")).not.toBeInTheDocument();
    expect(onFeedbackSubmit).not.toHaveBeenCalled();
  });

  it("disables an open draft with a reason when capability is lost and restores retry", async () => {
    const onFeedbackSubmit = vi.fn<MapSurfaceProps["onFeedbackSubmit"]>().mockResolvedValue({ status: "created" });
    const props = makeProps({ onFeedbackSubmit, feedbackEnabled: true });
    const { rerender } = await readyMap(props);
    await longPress();
    selectDraft();

    rerender(<MapSurface {...props} feedbackEnabled={false} />);

    expect(screen.getByTestId("feedback-panel")).toHaveStyle({ left: "380px", top: "250px" });
    expect(screen.getByRole("button", { name: "压力 75 烦躁" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "原因 拥挤" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "提交反馈" })).toBeDisabled();
    expect(screen.getByText("反馈服务暂不可用，草稿已保留，请恢复连接后提交。")).toBeInTheDocument();
    await submit();
    expect(onFeedbackSubmit).not.toHaveBeenCalled();

    rerender(<MapSurface {...props} feedbackEnabled />);
    expect(screen.getByRole("button", { name: "提交反馈" })).toBeEnabled();
    await submit();
    expect(onFeedbackSubmit).toHaveBeenCalledWith({ location: CAMPUS.center, stressLevel: 75, tag: "CROWD" });
  });

  it("reports loading and AMap modes through its callback", async () => {
    const onModeChange = vi.fn();
    await readyMap(makeProps({ onModeChange }));

    expect(onModeChange.mock.calls.map(([mode]) => mode)).toEqual(["loading", "amap"]);
  });

  it("reports loading and offline fallback independently of feedback capability", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const onModeChange = vi.fn();
    render(<MapSurface {...makeProps({ onModeChange, feedbackEnabled: false })} />);
    await screen.findByText("离线演示地图");

    expect(onModeChange.mock.calls.map(([mode]) => mode)).toEqual(["loading", "offline"]);
  });
});
