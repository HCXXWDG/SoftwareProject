import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { RoutePreviewPage } from "./RoutePreviewPage";

const mockRouteComparison = {
  routes: [
    {
      id: "r1",
      label: "路线 A（东侧步道）",
      distanceMeters: 850,
      durationSeconds: 600,
      stressExposure: 0.4,
      stressScore: 38,
      confidence: 0.85,
      fastest: true,
      leastStressful: false,
      polyline: [{ longitude: 120.3345, latitude: 31.492 }],
    },
    {
      id: "r2",
      label: "路线 B（蠡湖环路）",
      distanceMeters: 1100,
      durationSeconds: 780,
      stressExposure: 0.2,
      stressScore: 22,
      confidence: 0.78,
      fastest: false,
      leastStressful: true,
      polyline: [{ longitude: 120.333, latitude: 31.487 }],
    },
  ],
  fastestRouteId: "r1",
  leastStressfulRouteId: "r2",
  recommendation: "推荐路线 B（最少心累）",
  recommendAlternative: true,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RoutePreviewPage", () => {
  it("shows loading state initially then route cards on success", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRouteComparison),
    });

    const onEnterMap = vi.fn();
    render(<RoutePreviewPage onEnterMap={onEnterMap} />);

    // Loading state
    expect(screen.getByRole("status")).toHaveTextContent("正在获取路线数据");

    // Wait for routes to load
    await waitFor(() => {
      expect(screen.getByText("路线 A（东侧步道）")).toBeInTheDocument();
    });

    expect(screen.getByText("路线 B（蠡湖环路）")).toBeInTheDocument();
    expect(screen.getByText(/推荐路线 B/)).toBeInTheDocument();

    // "进入地图" button should be available
    const cta = screen.getByRole("button", { name: "进入地图" });
    expect(cta).toBeInTheDocument();

    // Click should call onEnterMap with comparison data
    cta.click();
    expect(onEnterMap).toHaveBeenCalledTimes(1);
    expect(onEnterMap).toHaveBeenCalledWith(
      expect.objectContaining({ fastestRouteId: "r1" }),
      false,
    );
  });

  it("shows retry and offline buttons on failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    const onEnterMap = vi.fn();
    render(<RoutePreviewPage onEnterMap={onEnterMap} />);

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText("Network error")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重试" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "进入离线地图" }),
    ).toBeInTheDocument();
  });

  it("enters offline map when clicking the offline button", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("offline"),
    );

    const onEnterMap = vi.fn();
    render(<RoutePreviewPage onEnterMap={onEnterMap} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "进入离线地图" })).toBeInTheDocument();
    });

    screen.getByRole("button", { name: "进入离线地图" }).click();

    expect(onEnterMap).toHaveBeenCalledTimes(1);
    expect(onEnterMap).toHaveBeenCalledWith(
      expect.objectContaining({ routes: expect.any(Array) }),
      true,
    );
  });
});
