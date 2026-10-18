import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WelcomePage } from "./WelcomePage";
import { DEFAULT_DESTINATION, DEFAULT_ORIGIN, WAYPOINTS } from "../config/campus";

describe("WelcomePage", () => {
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
