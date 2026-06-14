import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScoredRoute } from "../../types";
import { RouteOverlay } from "./RouteOverlay";

const mockProject = () => ({ x: 100, y: 200 });

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
  polyline: [
    { longitude: 116.392, latitude: 39.905 },
    { longitude: 116.400, latitude: 39.908 },
    { longitude: 116.405, latitude: 39.912 },
  ],
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
  polyline: [
    { longitude: 116.392, latitude: 39.905 },
    { longitude: 116.395, latitude: 39.910 },
    { longitude: 116.405, latitude: 39.912 },
  ],
};

describe("RouteOverlay", () => {
  it("renders nothing when routes are empty", () => {
    const { container } = render(
      <RouteOverlay
        project={mockProject}
        routes={[]}
        viewportRevision={0}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders polylines for each route", () => {
    render(
      <RouteOverlay
        project={mockProject}
        routes={[routeFast, routeCalm]}
        selectedRouteId="route-fast"
        viewportRevision={0}
      />,
    );

    const overlay = screen.getByTestId("route-overlay");
    const lines = overlay.querySelectorAll("polyline");
    expect(lines).toHaveLength(2);
  });

  it("highlights selected route with solid stroke", () => {
    render(
      <RouteOverlay
        project={mockProject}
        routes={[routeFast, routeCalm]}
        selectedRouteId="route-fast"
        viewportRevision={0}
      />,
    );

    const selectedLine = screen
      .getByTestId("route-overlay")
      .querySelector('[data-route-id="route-fast"]');
    expect(selectedLine).toHaveAttribute("stroke", "#2368ff");
    expect(selectedLine).toHaveAttribute("stroke-dasharray", "none");
    expect(selectedLine).toHaveAttribute("stroke-width", "4");
  });

  it("renders non-selected route with dashed stroke", () => {
    render(
      <RouteOverlay
        project={mockProject}
        routes={[routeFast, routeCalm]}
        selectedRouteId="route-fast"
        viewportRevision={0}
      />,
    );

    const calmLine = screen
      .getByTestId("route-overlay")
      .querySelector('[data-route-id="route-calm"]');
    expect(calmLine).toHaveAttribute("stroke", "#a0b4c0");
    expect(calmLine).toHaveAttribute("stroke-dasharray", "8 4");
  });

  it("calls onRouteSelect when a route is clicked", () => {
    const onRouteSelect = vi.fn();
    render(
      <RouteOverlay
        project={mockProject}
        routes={[routeFast, routeCalm]}
        selectedRouteId="route-fast"
        viewportRevision={0}
        onRouteSelect={onRouteSelect}
      />,
    );

    const calmLine = screen
      .getByTestId("route-overlay")
      .querySelector('[data-route-id="route-calm"]');
    fireEvent.click(calmLine!);
    expect(onRouteSelect).toHaveBeenCalledWith("route-calm");
  });

  it("projects route polyline coordinates", () => {
    const project = vi.fn(() => ({ x: 50, y: 75 }));
    render(
      <RouteOverlay
        project={project}
        routes={[routeFast]}
        viewportRevision={0}
      />,
    );

    // project should have been called for each polyline point
    expect(project).toHaveBeenCalledTimes(3);
    expect(project).toHaveBeenCalledWith({ longitude: 116.392, latitude: 39.905 });
  });
});
