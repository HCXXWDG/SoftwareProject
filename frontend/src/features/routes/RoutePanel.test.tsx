import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScoredRoute } from "../../types";
import { RoutePanel } from "./RoutePanel";

const routeFast: ScoredRoute = {
  id: "route-fast",
  label: "最快路线 A",
  distanceMeters: 2100,
  durationSeconds: 720,
  stressExposure: 67.2,
  stressScore: 50.4,
  confidence: 0.68,
  fastest: true,
  leastStressful: false,
  polyline: [],
};

const routeCalm: ScoredRoute = {
  id: "route-calm",
  label: "少心累路线 B",
  distanceMeters: 2800,
  durationSeconds: 960,
  stressExposure: 30.1,
  stressScore: 25.0,
  confidence: 0.72,
  fastest: false,
  leastStressful: true,
  polyline: [],
};

describe("RoutePanel", () => {
  it("renders nothing when routes are empty", () => {
    const { container } = render(
      <RoutePanel routes={[]} onSelectRoute={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders two route cards", () => {
    render(
      <RoutePanel
        routes={[routeFast, routeCalm]}
        selectedRouteId="route-fast"
        onSelectRoute={vi.fn()}
      />,
    );

    expect(screen.getByText("最快路线 A")).toBeInTheDocument();
    expect(screen.getByText("少心累路线 B")).toBeInTheDocument();
    expect(screen.getByText("最快")).toBeInTheDocument();
    expect(screen.getByText("少心累")).toBeInTheDocument();
  });

  it("formats distance and duration", () => {
    render(
      <RoutePanel
        routes={[routeFast, routeCalm]}
        onSelectRoute={vi.fn()}
      />,
    );

    expect(screen.getByText("2.1 km")).toBeInTheDocument();
    expect(screen.getByText("12 分钟")).toBeInTheDocument();
    expect(screen.getByText("2.8 km")).toBeInTheDocument();
    expect(screen.getByText("16 分钟")).toBeInTheDocument();
  });

  it("calls onSelectRoute when a card is clicked", () => {
    const onSelectRoute = vi.fn();
    render(
      <RoutePanel
        routes={[routeFast, routeCalm]}
        selectedRouteId="route-fast"
        onSelectRoute={onSelectRoute}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /选择 少心累路线 B/ }));
    expect(onSelectRoute).toHaveBeenCalledWith("route-calm");
  });

  it("marks selected card with aria-pressed", () => {
    render(
      <RoutePanel
        routes={[routeFast, routeCalm]}
        selectedRouteId="route-fast"
        onSelectRoute={vi.fn()}
      />,
    );

    const fastCard = screen.getByRole("button", { name: /选择 最快路线 A/ });
    const calmCard = screen.getByRole("button", { name: /选择 少心累路线 B/ });
    expect(fastCard).toHaveAttribute("aria-pressed", "true");
    expect(calmCard).toHaveAttribute("aria-pressed", "false");
  });
});
