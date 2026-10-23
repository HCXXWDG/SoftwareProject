import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { submitReport } from "./services/report";
import { compareRoutes } from "./services/route";
import { fetchHeatmap } from "./services/heatmap";
import { fetchTrends } from "./services/commute";
import { fetchRouteHistory } from "./services/history";
import type { MapSurfaceProps } from "./features/map/MapSurface";
import { deferred, emptyTrend, routeComparison } from "./test/fixtures";
import type { ReportResponse } from "./services/report";

vi.mock("./services/report", () => ({ submitReport: vi.fn() }));
vi.mock("./services/route", () => ({ compareRoutes: vi.fn() }));
vi.mock("./services/heatmap", () => ({ fetchHeatmap: vi.fn() }));
vi.mock("./services/commute", () => ({ fetchTrends: vi.fn() }));
vi.mock("./services/history", () => ({ fetchRouteHistory: vi.fn() }));
vi.mock("./features/map", () => ({
  MapSurface: (props: MapSurfaceProps) => <button type="button" disabled={!props.feedbackEnabled}
    onClick={() => { void props.onFeedbackSubmit({ location: { longitude: 120.27351, latitude: 31.475328 }, stressLevel: 50, tag: "NOISE" }); }}>
    提交测试反馈
  </button>,
}));

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.mocked(compareRoutes).mockResolvedValue(routeComparison);
  vi.mocked(fetchHeatmap).mockResolvedValue([]);
  vi.mocked(fetchTrends).mockResolvedValue(emptyTrend);
  vi.mocked(fetchRouteHistory).mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function enterDefaultMap() {
  fireEvent.click(screen.getByRole("button", { name: "查看路线" }));
  fireEvent.click(await screen.findByRole("button", { name: "进入地图" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "提交测试反馈" })).not.toBeDisabled());
}

it("returns from simulated heatmap to real feedback after saving a new report", async () => {
  vi.mocked(submitReport).mockResolvedValue({ status: "created", message: "情绪反馈已加入热力图。" });
  render(<App />);
  await enterDefaultMap();
  fireEvent.click(screen.getByRole("button", { name: "演示热力图" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "演示热力图" })).toHaveAttribute("aria-pressed", "true"));
  expect(vi.mocked(fetchHeatmap).mock.lastCall?.[4]).toBe("SIMULATED_ONLY");
  fireEvent.click(screen.getByRole("button", { name: "提交测试反馈" }));
  await screen.findByText("反馈已提交，当前视口热力图已更新。");
  expect(screen.getByRole("button", { name: "真实反馈" })).toHaveAttribute("aria-pressed", "true");
  expect(vi.mocked(fetchHeatmap).mock.lastCall?.[4]).toBe("REAL_ONLY");
  expect(submitReport).toHaveBeenCalledTimes(1);
});

it("ignores an old report response after leaving and returning to the same endpoints", async () => {
  const oldReport = deferred<ReportResponse>();
  vi.mocked(submitReport).mockReturnValueOnce(oldReport.promise);
  render(<App />);
  await enterDefaultMap();
  fireEvent.click(screen.getByRole("button", { name: "提交测试反馈" }));
  expect(submitReport).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "修改起终点" }));
  await enterDefaultMap();
  const queriesBeforeOldResponse = vi.mocked(fetchHeatmap).mock.calls.length;
  await act(async () => { oldReport.resolve({ status: "created", message: "情绪反馈已加入热力图。" }); });

  expect(submitReport).toHaveBeenCalledTimes(1);
  expect(fetchHeatmap).toHaveBeenCalledTimes(queriesBeforeOldResponse);
  expect(screen.queryByText(/反馈已提交/)).not.toBeInTheDocument();
  expect(screen.queryByText(/这条反馈已提交过/)).not.toBeInTheDocument();
});
