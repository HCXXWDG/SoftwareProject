import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScoredRoute } from "../../types";
import { RouteLegend } from "./RouteLegend";

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

describe("RouteLegend", () => {
  it("renders nothing when routes are empty", () => {
    const { container } = render(<RouteLegend routes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("displays labels for all routes", () => {
    render(
      <RouteLegend
        routes={[routeFast, routeCalm]}
        selectedRouteId="route-fast"
      />,
    );

    expect(screen.getByText("最快路线 A")).toBeInTheDocument();
    expect(screen.getByText("少心累路线 B")).toBeInTheDocument();
  });

  it("marks selected route with selected class", () => {
    render(
      <RouteLegend
        routes={[routeFast, routeCalm]}
        selectedRouteId="route-fast"
      />,
    );

    const legend = screen.getByTestId("route-legend");
    const selectedItem = legend.querySelector(".map-surface__route-legend-item--selected");
    expect(selectedItem).not.toBeNull();
    expect(selectedItem!.textContent).toContain("最快路线 A");
  });
});
