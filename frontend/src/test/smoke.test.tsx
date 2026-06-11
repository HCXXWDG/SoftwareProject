import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
