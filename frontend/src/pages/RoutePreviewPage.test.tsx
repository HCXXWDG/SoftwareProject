import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { RoutePreviewPage } from "./RoutePreviewPage";
import { CAMPUS_POINTS } from "../config/campus";

const mockRouteComparison = {
  routes: [
    {
      id: "r1",
      label: "路线 A（快捷路线）",
      distanceMeters: 850,
      durationSeconds: 600,
      stressExposure: 0.4,
      stressScore: 45,
      confidence: 0.85,
      fastest: true,
      leastStressful: false,
      polyline: [CAMPUS_POINTS[0].point],
    },
    {
      id: "r2",
      label: "路线 B（舒适路线）",
      distanceMeters: 1100,
      durationSeconds: 780,
      stressExposure: 0.2,
      stressScore: 22,
      confidence: 0.78,
      fastest: false,
      leastStressful: true,
      polyline: [CAMPUS_POINTS[1].point],
    },
    {
      id: "r3",
      label: "路线 C（风景路线）",
      distanceMeters: 1300,
      durationSeconds: 900,
      stressExposure: 0.3,
      stressScore: 38,
      confidence: 0.65,
      fastest: false,
      leastStressful: false,
      polyline: [CAMPUS_POINTS[2].point],
    },
  ],
  fastestRouteId: "r1",
  leastStressfulRouteId: "r2",
  recommendation: "推荐路线 B（舒适路线）",
  recommendAlternative: true,
};

const defaultOrigin = CAMPUS_POINTS[0].point;
const defaultDest = CAMPUS_POINTS[1].point;
const defaultProps = {
  origin: defaultOrigin,
  destination: defaultDest,
  originName: "学生公寓区",
  destName: "第一教学楼",
  onEnterMap: vi.fn(),
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
    render(<RoutePreviewPage {...defaultProps} onEnterMap={onEnterMap} />);

    expect(screen.getByRole("status")).toHaveTextContent("正在获取路线数据");

    await waitFor(() => {
      expect(screen.getByText("路线 A（快捷路线）")).toBeInTheDocument();
    });

    expect(screen.getByText("路线 B（舒适路线）")).toBeInTheDocument();
    expect(screen.getByText("路线 C（风景路线）")).toBeInTheDocument();
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
    render(<RoutePreviewPage {...defaultProps} onEnterMap={onEnterMap} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText("Network error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "进入离线地图" })).toBeInTheDocument();
  });

  it("sends compareRoutes request with props origin/destination", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRouteComparison),
    });

    render(<RoutePreviewPage {...defaultProps} onEnterMap={vi.fn()} />);

    await waitFor(() => {
      const compareCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("/routes/compare"),
      );
      expect(compareCall).toBeDefined();
      const body = JSON.parse((compareCall![1] as RequestInit).body as string);
      expect(body.origin.longitude).toBe(defaultOrigin.longitude);
      expect(body.origin.latitude).toBe(defaultOrigin.latitude);
      expect(body.destination.longitude).toBe(defaultDest.longitude);
      expect(body.destination.latitude).toBe(defaultDest.latitude);
    });
  });

  it("enters offline map with generateMockRoutes when clicking offline button", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("offline"),
    );

    const onEnterMap = vi.fn();
    render(<RoutePreviewPage {...defaultProps} onEnterMap={onEnterMap} />);

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

  it("shows origin and destination names in route info", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRouteComparison),
    });

    render(<RoutePreviewPage {...defaultProps} onEnterMap={vi.fn()} />);

    expect(screen.getByText("学生公寓区 → 第一教学楼")).toBeInTheDocument();
  });

  it("renders back button when onBack is provided", () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRouteComparison),
    });

    const onBack = vi.fn();
    render(<RoutePreviewPage {...defaultProps} onEnterMap={vi.fn()} onBack={onBack} />);

    const backBtn = screen.getByRole("button", { name: /重新选择/ });
    expect(backBtn).toBeInTheDocument();

    backBtn.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
