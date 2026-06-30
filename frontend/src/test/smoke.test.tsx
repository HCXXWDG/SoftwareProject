import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MapPage } from "../pages/MapPage";
import type { MapPageState, HeatmapCell } from "../types";
import { CAMPUS } from "../config/campus";

const baseState: MapPageState = {
  heatmapCells: [],
  loading: false,
  error: null,
  routeComparison: null,
  trend: null,
};

const mockCell: HeatmapCell = {
  cellId: "16:129323:44339",
  center: { longitude: CAMPUS.center.longitude, latitude: CAMPUS.center.latitude },
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

// ─── Helpers ──────────────────────────────────────────────

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
      polyline: [
        { longitude: CAMPUS.origin.longitude, latitude: CAMPUS.origin.latitude },
        { longitude: CAMPUS.destination.longitude, latitude: CAMPUS.destination.latitude },
      ],
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
      polyline: [
        { longitude: CAMPUS.origin.longitude, latitude: CAMPUS.origin.latitude },
        { longitude: CAMPUS.destination.longitude, latitude: CAMPUS.destination.latitude },
      ],
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

/** Select origin and destination on WelcomePage, then navigate to route preview */
function selectEndpoints() {
  // Click "学生公寓区" as origin (first occurrence in origin grid)
  const originBtns = screen.getAllByText("学生公寓区");
  fireEvent.click(originBtns[0]);
  // Click "第一教学楼" as destination (second occurrence in dest grid)
  const destBtns = screen.getAllByText("第一教学楼");
  fireEvent.click(destBtns.length > 1 ? destBtns[1] : destBtns[0]);
}

/** Navigate from welcome → route-preview → map */
async function navigateToMap() {
  selectEndpoints();
  fireEvent.click(screen.getByRole("button", { name: "查看推荐路线" }));
  await waitFor(() => {
    expect(screen.getByText("推荐路线")).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByText("进入地图")).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText("进入地图"));
  await waitFor(() => {
    expect(screen.getByText("完成本次通勤")).toBeInTheDocument();
  });
}

// ─── App three-stage flow ────────────────────────────────

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

    expect(screen.getByText("校园通勤情绪地图")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看推荐路线" })).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("welcome page does NOT show map, routes, trends or commute button", async () => {
    const { default: App } = await import("../App");
    render(<App />);

    expect(screen.queryByText("完成本次通勤")).toBeNull();
    expect(screen.queryByText("高德地图")).toBeNull();
    expect(screen.queryByText("离线演示地图")).toBeNull();
    expect(screen.queryByTestId("route-overlay")).toBeNull();
    expect(screen.queryByTestId("route-legend")).toBeNull();
  });

  it("route preview sends compareRoutes with selected endpoints", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRouteComparison),
    });

    const { default: App } = await import("../App");
    render(<App />);

    selectEndpoints();
    fireEvent.click(screen.getByRole("button", { name: "查看推荐路线" }));

    await waitFor(() => {
      const compareCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("/routes/compare"),
      );
      expect(compareCall).toBeDefined();
      const body = JSON.parse((compareCall![1] as RequestInit).body as string);
      expect(body.origin.longitude).toBe(CAMPUS.origin.longitude);
      expect(body.origin.latitude).toBe(CAMPUS.origin.latitude);
      expect(body.destination.longitude).toBe(CAMPUS.destination.longitude);
      expect(body.destination.latitude).toBe(CAMPUS.destination.latitude);
    });
  });

  it("heatmap and trends are NOT requested until user enters map", async () => {
    const calls: { url: string }[] = [];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: string) => {
        calls.push({ url });
        if (url.includes("/routes/compare")) {
          return { ok: true, json: () => Promise.resolve(mockRouteComparison) };
        }
        return { ok: true, json: () => Promise.resolve([]) };
      },
    );

    const { default: App } = await import("../App");
    render(<App />);

    // Welcome stage — no API at all
    expect(calls).toHaveLength(0);

    // Navigate to route-preview
    selectEndpoints();
    fireEvent.click(screen.getByRole("button", { name: "查看推荐路线" }));
    await waitFor(() => {
      expect(screen.getByText("推荐路线")).toBeInTheDocument();
    });

    // Only compareRoutes should be called — no heatmap or trends yet
    const heatmapBefore = calls.filter((c) => c.url.includes("/heatmap"));
    const trendsBefore = calls.filter((c) => c.url.includes("/commutes/trends"));
    expect(heatmapBefore).toHaveLength(0);
    expect(trendsBefore).toHaveLength(0);

    // Click "进入地图"
    fireEvent.click(screen.getByText("进入地图"));
    await waitFor(() => {
      expect(screen.getByText("完成本次通勤")).toBeInTheDocument();
    });

    // Now heatmap and trends should be requested
    const heatmapAfter = calls.filter((c) => c.url.includes("/heatmap"));
    const trendsAfter = calls.filter((c) => c.url.includes("/commutes/trends"));
    expect(heatmapAfter.length).toBeGreaterThanOrEqual(1);
    expect(trendsAfter.length).toBeGreaterThanOrEqual(1);
  });

  it("user selects endpoints on welcome page before navigating", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRouteComparison),
    });

    const { default: App } = await import("../App");
    render(<App />);

    // CTA should be disabled before selecting endpoints
    const cta = screen.getByRole("button", { name: "查看推荐路线" });
    expect(cta).toBeDisabled();

    // Select endpoints
    selectEndpoints();

    // CTA should now be enabled
    expect(cta).not.toBeDisabled();

    // Summary shows selected route
    expect(screen.getByText("学生公寓区")).toBeInTheDocument();
    expect(screen.getByText("第一教学楼")).toBeInTheDocument();

    fireEvent.click(cta);
    await waitFor(() => {
      expect(screen.getByText("进入地图")).toBeInTheDocument();
    });
  });

  it("route preview failure shows retry and offline entry", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    const { default: App } = await import("../App");
    render(<App />);

    selectEndpoints();
    fireEvent.click(screen.getByRole("button", { name: "查看推荐路线" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "进入离线地图" })).toBeInTheDocument();
  });

  it("offline entry enters map without fake scores", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("offline"),
    );

    const { default: App } = await import("../App");
    render(<App />);

    selectEndpoints();
    fireEvent.click(screen.getByRole("button", { name: "查看推荐路线" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "进入离线地图" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "进入离线地图" }));

    // Map stage should appear, with offline banner
    await waitFor(() => {
      expect(screen.getByText("完成本次通勤")).toBeInTheDocument();
    });
    expect(screen.getByText(/离线模式/)).toBeInTheDocument();
  });
});

// ─── Commute submission flow ─────────────────────────────

describe("Commute submission flow", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "75" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /选择 路线 B/ }));
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
      expect(body.alternativeLabel).toBe("路线 A（东侧步道）");
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
