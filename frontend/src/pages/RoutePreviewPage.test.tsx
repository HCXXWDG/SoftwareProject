import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { RoutePreviewPage } from "./RoutePreviewPage";
import { DEFAULT_ORIGIN, DEFAULT_DESTINATION } from "../config/campus";

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
      polyline: [{ longitude: DEFAULT_ORIGIN.point.longitude, latitude: DEFAULT_ORIGIN.point.latitude }],
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
      polyline: [{ longitude: DEFAULT_DESTINATION.point.longitude, latitude: DEFAULT_DESTINATION.point.latitude }],
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

    expect(screen.getByRole("status")).toHaveTextContent("正在获取路线数据");

    await waitFor(() => {
      expect(screen.getByText("路线 A（东侧步道）")).toBeInTheDocument();
    });

    expect(screen.getByText("路线 B（蠡湖环路）")).toBeInTheDocument();
    expect(screen.getByText(/推荐路线 B/)).toBeInTheDocument();

    const cta = screen.getByRole("button", { name: "进入地图" });
    expect(cta).toBeInTheDocument();

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

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText("Network error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "进入离线地图" })).toBeInTheDocument();
  });

  it("sends compareRoutes request with campus endpoints", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRouteComparison),
    });

    const onEnterMap = vi.fn();
    render(<RoutePreviewPage onEnterMap={onEnterMap} />);

    await waitFor(() => {
      const compareCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("/routes/compare"),
      );
      expect(compareCall).toBeDefined();
      const body = JSON.parse((compareCall![1] as RequestInit).body as string);
      expect(body.origin.longitude).toBe(DEFAULT_ORIGIN.point.longitude);
      expect(body.origin.latitude).toBe(DEFAULT_ORIGIN.point.latitude);
      expect(body.destination.longitude).toBe(DEFAULT_DESTINATION.point.longitude);
      expect(body.destination.latitude).toBe(DEFAULT_DESTINATION.point.latitude);
    });
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