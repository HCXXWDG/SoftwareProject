import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MapPage } from "../pages/MapPage";
import type { MapPageState, HeatmapCell } from "../types";

const baseState: MapPageState = {
  heatmapCells: [],
  loading: false,
  error: null,
  routeComparison: null,
  trend: null,
};

const mockCell: HeatmapCell = {
  cellId: "16:129323:44339",
  center: { longitude: 120.338, latitude: 31.488 },
  score: 62.5,
  confidence: 0.18,
  count: 1,
  dominantTag: "NOISE",
};

describe("MapPage component", () => {
  it("shows loading spinner when loading is true", () => {
    render(<MapPage state={{ ...baseState, loading: true }} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在加载热力图数据");
  });

  it("shows error message with alert role", () => {
    render(<MapPage state={{ ...baseState, error: "API 500: 服务异常" }} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("API 500: 服务异常");
  });

  it("shows data summary when heatmap cells are loaded", () => {
    const cells: HeatmapCell[] = Array.from({ length: 42 }, (_, i) => ({
      ...mockCell,
      cellId: `cell-${i}`,
    }));
    render(<MapPage state={{ ...baseState, heatmapCells: cells }} />);
    const summary = screen.getByRole("status", { name: "数据摘要" });
    expect(summary).toHaveTextContent("42");
    expect(summary).toHaveTextContent("个热力图单元格已加载");
  });

  it("does not show summary when cells are empty and not loading", () => {
    render(<MapPage state={baseState} />);
    expect(screen.queryByText(/个热力图单元格已加载/)).toBeNull();
  });

  it("shows placeholder when mapSlot is not provided", () => {
    render(<MapPage state={baseState} />);
    expect(screen.getByText(/地图区域/)).toBeInTheDocument();
  });

  it("renders custom mapSlot when provided", () => {
    render(
      <MapPage
        state={baseState}
        mapSlot={<div data-testid="custom-map">Custom Map</div>}
      />
    );
    expect(screen.getByTestId("custom-map")).toBeInTheDocument();
    expect(screen.queryByText(/地图区域/)).toBeNull();
  });
});

describe("App three-stage flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows welcome page on initial load without API calls", async () => {
    const { default: App } = await import("../App");
    render(<App />);

    // Welcome page should be visible
    expect(screen.getByText("校园通勤情绪地图")).toBeInTheDocument();
    expect(screen.getByText("查看预设路线")).toBeInTheDocument();

    // No fetch calls should have been made
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("navigates to route preview when clicking the CTA button", async () => {
    // Mock route comparison response
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
      recommendation: "推荐路线 B",
      recommendAlternative: true,
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRouteComparison),
    });

    const { default: App } = await import("../App");
    render(<App />);

    // Click "查看预设路线"
    fireEvent.click(screen.getByText("查看预设路线"));

    // Route preview page should appear
    await waitFor(() => {
      expect(screen.getByText("预设路线")).toBeInTheDocument();
    });

    // API should have been called for route comparison
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/routes/compare"),
      expect.anything(),
    );
  });
});

describe("Commute submission flow", () => {
  const mockRouteComparison = {
    routes: [
      {
        id: "r1",
        label: "路线 A",
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
        label: "路线 B",
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
    recommendation: "推荐路线 B",
    recommendAlternative: true,
  };

  const mockTrend = {
    points: [{ date: "2025-06-10", averageStress: 40, commuteCount: 2 }],
    recommendation: "保持好心情",
    totalCommutes: 2,
  };

  function mockFetchForCommute(mode: "success" | "fail" | "success-trend-fail") {
    const calls: { url: string; init?: RequestInit }[] = [];
    let trendCallCount = 0;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.includes("/heatmap")) {
          return { ok: true, json: () => Promise.resolve([]) };
        }
        if (url.includes("/routes/compare")) {
          return { ok: true, json: () => Promise.resolve(mockRouteComparison) };
        }
        if (url.includes("/commutes/trends")) {
          trendCallCount++;
          if (mode === "success-trend-fail" && trendCallCount > 1) {
            return { ok: false, status: 500, text: () => Promise.resolve("Internal Server Error") };
          }
          return { ok: true, json: () => Promise.resolve(mockTrend) };
        }
        if (url.includes("/commutes/complete")) {
          if (mode === "success" || mode === "success-trend-fail") {
            return {
              ok: true,
              json: () =>
                Promise.resolve({
                  id: "c1",
                  deviceHash: "h",
                  routeId: "r1",
                  routeLabel: "路线 A",
                  endStressLevel: 50,
                  durationMinutes: 10,
                  selectedScore: 38,
                  fastestScore: 38,
                  alternativeLabel: "路线 B",
                  alternativeScore: 22,
                  alternativeDurationRatio: 1.25,
                  confidence: 0.85,
                  completedAt: "2025-06-10T09:00:00Z",
                }),
            };
          }
          return {
            ok: false,
            status: 400,
            text: () => Promise.resolve("endStressLevel 必须为 0/25/50/75/100"),
          };
        }
        return { ok: true, json: () => Promise.resolve([]) };
      },
    );
    return calls;
  }

  /** Navigate from welcome → route-preview → map */
  async function navigateToMap() {
    // Click "查看预设路线" (welcome → route-preview)
    fireEvent.click(screen.getByText("查看预设路线"));

    // Wait for route preview to load
    await waitFor(() => {
      expect(screen.getByText("预设路线")).toBeInTheDocument();
    });

    // Wait for routes to appear
    await waitFor(() => {
      expect(screen.getByText("进入地图")).toBeInTheDocument();
    });

    // Click "进入地图" (route-preview → map)
    fireEvent.click(screen.getByText("进入地图"));

    // Wait for map stage to render
    await waitFor(() => {
      expect(screen.getByText("完成本次通勤")).toBeInTheDocument();
    });
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends valid endStressLevel when completing commute", async () => {
    const calls = mockFetchForCommute("success");
    const { default: App } = await import("../App");
    render(<App />);

    await navigateToMap();

    // 选择压力档位
    fireEvent.click(screen.getByRole("button", { name: "50" }));
    fireEvent.click(screen.getByText("完成本次通勤"));

    await waitFor(() => {
      const completeCall = calls.find((c) =>
        c.url.includes("/commutes/complete"),
      );
      expect(completeCall).toBeDefined();
      const body = JSON.parse(completeCall!.init!.body as string);
      expect([0, 25, 50, 75, 100]).toContain(body.endStressLevel);
      expect(body.endStressLevel).toBe(50);
    });
  });

  it("refreshes trends after successful commute", async () => {
    const calls = mockFetchForCommute("success");
    const { default: App } = await import("../App");
    render(<App />);

    await navigateToMap();

    fireEvent.click(screen.getByRole("button", { name: "50" }));
    fireEvent.click(screen.getByText("完成本次通勤"));

    await waitFor(() => {
      const trendsCalls = calls.filter((c) =>
        c.url.includes("/commutes/trends"),
      );
      expect(trendsCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows error message when commute submission fails", async () => {
    mockFetchForCommute("fail");
    const { default: App } = await import("../App");
    render(<App />);

    await navigateToMap();

    fireEvent.click(screen.getByRole("button", { name: "50" }));
    fireEvent.click(screen.getByText("完成本次通勤"));

    await waitFor(() => {
      const alert = screen.queryByRole("alert");
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toMatch(/endStressLevel|通勤失败/);
    });
  });

  it("selecting least-stressful route sends correct routeId and alternative fallback", async () => {
    const calls = mockFetchForCommute("success");
    const { default: App } = await import("../App");
    render(<App />);

    await navigateToMap();

    // 选择压力档位
    fireEvent.click(screen.getByRole("button", { name: "75" }));

    // 选择路线 B（leastStressful, r2）
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "选择 路线 B" }));
    });

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "完成本次通勤" });
      expect(btn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "完成本次通勤" }));
    });

    await waitFor(() => {
      const completeCall = calls.find((c) =>
        c.url.includes("/commutes/complete"),
      );
      expect(completeCall).toBeDefined();
      const body = JSON.parse(completeCall!.init!.body as string);
      expect(body.routeId).toBe("r2");
      expect(body.alternativeLabel).toBe("路线 A");
    });
  });

  it("shows warning but not error when POST succeeds and trend refresh fails", async () => {
    mockFetchForCommute("success-trend-fail");
    const { default: App } = await import("../App");
    render(<App />);

    await navigateToMap();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "50" }));
    });

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "完成本次通勤" });
      expect(btn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "完成本次通勤" }));
    });

    await waitFor(() => {
      expect(screen.getByText(/趋势数据刷新失败/)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
