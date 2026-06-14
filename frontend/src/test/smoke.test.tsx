import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MapPage } from "../pages/MapPage";
import type { MapPageState, HeatmapCell } from "../types";

const baseState: MapPageState = {
  heatmapCells: [],
  loading: false,
  error: null,
  routeComparison: null,
  trend: null,
  selectedOrigin: null,
  selectedDestination: null,
};

const mockCell: HeatmapCell = {
  cellId: "16:129323:44339",
  center: { longitude: 116.39, latitude: 39.91 },
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

describe("App API integration", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls heatmap API on mount and displays data", async () => {
    const mockCells = Array.from({ length: 5 }, (_, i) => ({
      ...mockCell,
      cellId: `api-cell-${i}`,
    }));

    // mock fetch 持续返回数据（App 可能多次调用：初始加载 + 视口回调）
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCells),
    });

    // Dynamically import App to trigger useEffect
    const { default: App } = await import("../App");
    render(<App />);

    // Initially shows loading（用文本匹配，避免多个 role="status" 冲突）
    expect(screen.getByText(/正在加载热力图数据/)).toBeInTheDocument();

    // After API resolves, shows data summary
    await waitFor(() => {
      expect(screen.getByText(/个热力图单元格已加载/)).toBeInTheDocument();
    });

    // Verify fetch was called with correct URL pattern
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/heatmap"),
      expect.anything()
    );
  });

  it("shows error when API call fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const { default: App } = await import("../App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("API 500");
    });
  });
});

describe("Commute submission flow", () => {
  const mockRouteComparison = {
    routes: [
      {
        id: "r1",
        label: "路线 A",
        distanceMeters: 3200,
        durationSeconds: 720,
        stressExposure: 0.4,
        stressScore: 38,
        confidence: 0.85,
        fastest: true,
        leastStressful: false,
        polyline: [{ longitude: 116.395, latitude: 39.905 }],
      },
      {
        id: "r2",
        label: "路线 B",
        distanceMeters: 3800,
        durationSeconds: 900,
        stressExposure: 0.2,
        stressScore: 22,
        confidence: 0.78,
        fastest: false,
        leastStressful: true,
        polyline: [{ longitude: 116.395, latitude: 39.905 }],
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

  function mockFetchForCommute(mode: "success" | "fail") {
    const calls: { url: string; init?: RequestInit }[] = [];
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
          return { ok: true, json: () => Promise.resolve(mockTrend) };
        }
        if (url.includes("/commutes/complete")) {
          if (mode === "success") {
            return {
              ok: true,
              json: () =>
                Promise.resolve({
                  id: "c1",
                  deviceHash: "h",
                  routeId: "r1",
                  routeLabel: "路线 A",
                  endStressLevel: 50,
                  durationMinutes: 12,
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

    await waitFor(() => {
      expect(screen.getByText("完成本次通勤")).toBeInTheDocument();
    });

    // 先选择压力档位（用户真实感受）
    fireEvent.click(screen.getByRole("button", { name: "50" }));
    fireEvent.click(screen.getByText("完成本次通勤"));

    await waitFor(() => {
      const completeCall = calls.find((c) =>
        c.url.includes("/commutes/complete"),
      );
      expect(completeCall).toBeDefined();
      const body = JSON.parse(completeCall!.init!.body as string);
      expect([0, 25, 50, 75, 100]).toContain(body.endStressLevel);
      // 应使用用户选择的档位，而非路线评分推导值
      expect(body.endStressLevel).toBe(50);
    });
  });

  it("refreshes trends after successful commute", async () => {
    const calls = mockFetchForCommute("success");
    const { default: App } = await import("../App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("完成本次通勤")).toBeInTheDocument();
    });

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

    await waitFor(() => {
      expect(screen.getByText("完成本次通勤")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "50" }));
    fireEvent.click(screen.getByText("完成本次通勤"));

    await waitFor(() => {
      const alert = screen.queryByRole("alert");
      expect(alert).not.toBeNull();
      expect(alert!.textContent).toMatch(/endStressLevel|通勤失败/);
    });
  });
});
