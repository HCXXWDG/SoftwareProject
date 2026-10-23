import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WelcomePage } from "./WelcomePage";
import { DEFAULT_DESTINATION, DEFAULT_ORIGIN, WAYPOINTS } from "../config/campus";

describe("WelcomePage", () => {
  it("selects a non-preset map origin while preserving the destination", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const navigate = vi.fn();
    render(<WelcomePage onNavigateToPreview={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "地图选择起点" }));
    const map = await screen.findByTestId("offline-map");
    fireEvent.keyDown(map, { key: "ArrowLeft" });
    const confirm = screen.getByRole("button", { name: "使用此位置作为起点" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole("button", { name: "查看路线" }));
    const [origin, destination, originName] = navigate.mock.calls[0];
    expect(origin.longitude).toBeLessThan(DEFAULT_ORIGIN.point.longitude);
    expect(destination).toEqual(DEFAULT_DESTINATION.point);
    expect(WAYPOINTS.some(point => point.point.longitude === origin.longitude && point.point.latitude === origin.latitude)).toBe(false);
    expect(originName).toMatch(/^地图起点/);
    vi.unstubAllEnvs();
  });

  it("keeps the previous selection when map selection is cancelled", async () => {
    vi.stubEnv("VITE_AMAP_JS_KEY", "");
    const navigate = vi.fn();
    render(<WelcomePage onNavigateToPreview={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "地图选择终点" }));
    fireEvent.keyDown(await screen.findByTestId("offline-map"), { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "取消选点" }));
    expect(screen.getByRole("button", { name: "地图选择终点" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "查看路线" }));
    expect(navigate).toHaveBeenCalledWith(DEFAULT_ORIGIN.point, DEFAULT_DESTINATION.point, DEFAULT_ORIGIN.name, DEFAULT_DESTINATION.name);
    vi.unstubAllEnvs();
  });
  it("shows the project and the default selected endpoints", () => {
    render(<WelcomePage onNavigateToPreview={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "校园通勤情绪地图" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "选择起点" })).getByRole("button", { name: DEFAULT_ORIGIN.name })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("group", { name: "选择终点" })).getByRole("button", { name: DEFAULT_DESTINATION.name })).toHaveAttribute("aria-pressed", "true");
  });
  it("submits the selected coordinates and names", () => {
    const navigate = vi.fn(); render(<WelcomePage onNavigateToPreview={navigate} />);
    fireEvent.click(within(screen.getByRole("group", { name: "选择终点" })).getByRole("button", { name: "图书馆" }));
    fireEvent.click(screen.getByRole("button", { name: "查看路线" }));
    expect(navigate).toHaveBeenCalledWith(DEFAULT_ORIGIN.point, WAYPOINTS[2].point, DEFAULT_ORIGIN.name, "图书馆");
  });
  it("cannot plan with identical origin and destination", () => {
    render(<WelcomePage onNavigateToPreview={vi.fn()} />);
    fireEvent.click(within(screen.getByRole("group", { name: "选择终点" })).getByRole("button", { name: DEFAULT_ORIGIN.name }));
    expect(screen.getByRole("button", { name: "查看路线" })).toBeDisabled();
  });
  it("restores selections without requesting the API", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<WelcomePage initialOriginId="library" initialDestinationId="sports" onNavigateToPreview={vi.fn()} />);
    expect(within(screen.getByRole("group", { name: "选择起点" })).getByRole("button", { name: "图书馆" })).toHaveAttribute("aria-pressed", "true");
    expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
  it("preserves non-preset history endpoints without silently replacing them", () => {
    const navigate = vi.fn();
    const origin = { id: "history-origin", name: "历史起点", point: { longitude: 120.2736, latitude: 31.4754 } };
    const destination = { id: "history-destination", name: "历史终点", point: { longitude: 120.2746, latitude: 31.4834 } };
    render(<WelcomePage initialOrigin={origin} initialDestination={destination} onNavigateToPreview={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "查看路线" }));
    expect(navigate).toHaveBeenCalledWith(origin.point, destination.point, origin.name, destination.name);
  });
  it("rejects identical coordinates even when history endpoint identifiers differ", () => {
    const point = { longitude: 120.2736, latitude: 31.4754 };
    render(<WelcomePage initialOrigin={{ id: "history-origin", name: "历史起点", point }}
      initialDestination={{ id: "history-destination", name: "历史终点", point }} onNavigateToPreview={vi.fn()} />);
    expect(screen.getByRole("button", { name: "查看路线" })).toBeDisabled();
  });
});
