import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GeoPoint } from "../../types";
import { EndpointMarkers } from "./EndpointMarkers";

const origin: GeoPoint = { longitude: 120.27351, latitude: 31.4753281 };
const destination: GeoPoint = { longitude: 120.2743195, latitude: 31.4832753 };
const project = (point: GeoPoint) => ({
  x: point.longitude * 10,
  y: point.latitude * 10,
});

describe("EndpointMarkers", () => {
  it("renders nothing when neither origin nor destination is provided", () => {
    const { container } = render(
      <EndpointMarkers project={project} viewportRevision={1} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders origin and destination markers with labels and test ids", () => {
    const { getByTestId, getByLabelText } = render(
      <EndpointMarkers
        origin={origin}
        destination={destination}
        project={project}
        viewportRevision={3}
      />,
    );

    const markers = getByTestId("endpoint-markers");
    expect(markers).toHaveAttribute("data-viewport-revision", "3");

    const originMarker = getByTestId("endpoint-origin");
    expect(originMarker).toHaveClass("map-surface__endpoint--origin");
    expect(originMarker).toHaveStyle({
      left: `${origin.longitude * 10}px`,
      top: `${origin.latitude * 10}px`,
    });
    expect(getByLabelText("起点")).toBe(originMarker);

    const destinationMarker = getByTestId("endpoint-destination");
    expect(destinationMarker).toHaveClass("map-surface__endpoint--destination");
    expect(getByLabelText("终点")).toBe(destinationMarker);
  });

  it("renders only the origin when destination is omitted", () => {
    const { getByTestId, queryByTestId } = render(
      <EndpointMarkers origin={origin} project={project} viewportRevision={1} />,
    );

    expect(getByTestId("endpoint-origin")).toBeInTheDocument();
    expect(queryByTestId("endpoint-destination")).toBeNull();
  });
});