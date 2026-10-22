import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ApiError } from "./services/api";
import { completeCommute, fetchTrends } from "./services/commute";
import { fetchHeatmap } from "./services/heatmap";
import { fetchRouteHistory } from "./services/history";
import { readPendingCommute } from "./services/pendingCommute";
import { compareRoutes } from "./services/route";
import { deferred, emptyTrend, routeComparison } from "./test/fixtures";
import type { CommuteCompleteRequest, CommuteCompletion, RouteComparison } from "./types";

vi.mock("./services/commute", () => ({ completeCommute: vi.fn(), fetchTrends: vi.fn() }));
vi.mock("./services/heatmap", () => ({ fetchHeatmap: vi.fn() }));
vi.mock("./services/history", () => ({ fetchRouteHistory: vi.fn() }));
vi.mock("./services/route", () => ({ compareRoutes: vi.fn() }));
vi.mock("./features/map", () => ({ MapSurface: () => <div data-testid="commute-test-map" /> }));

const snapshotId = "9f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40";
const nextSnapshotId = "7f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40";
const noScoring: RouteComparison = {
  ...routeComparison, snapshotId, routeSource: "REAL", feedbackSource: "NONE", scoringStatus: "UNAVAILABLE",
  leastStressfulRouteId: null, recommendAlternative: false,
  routes: routeComparison.routes.map(route => ({ ...route, stressScore: null, stressExposure: null,
    confidence: 0, leastStressful: false, scoringStatus: "UNAVAILABLE" })),
};

function receipt(input: CommuteCompleteRequest, changes: Partial<CommuteCompletion> = {}): CommuteCompletion {
  return { ...input, completedAt: input.completedAt!, status: "created", commuteId: "8f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40",
    routeLabel: "服务端记录路线", routeSource: "REAL", estimatedSeconds: 45, durationMinutes: 1,
    selectedScore: null, message: "通勤已记录。", ...changes };
}
const post = vi.mocked(completeCommute);
const trends = vi.mocked(fetchTrends);
const history = vi.mocked(fetchRouteHistory);
const compare = vi.mocked(compareRoutes);
const panel = () => within(screen.getByRole("region", { name: "通勤记录" }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VITE_COMMUTE_RECORDING_ENABLED", "true");
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  compare.mockResolvedValue(noScoring);
  vi.mocked(fetchHeatmap).mockResolvedValue([]);
  trends.mockResolvedValue(emptyTrend); history.mockResolvedValue([]);
  post.mockImplementation(async request => receipt(request));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

async function enterMap() {
  fireEvent.click(screen.getByRole("button", { name: "查看路线" }));
  fireEvent.click(await screen.findByRole("button", { name: "进入地图" }));
  await waitFor(() => expect(trends).toHaveBeenCalled());
  await waitFor(() => expect(history).toHaveBeenCalled());
}
async function selectAndComplete(level = "25 · 比较轻松") {
  fireEvent.click(panel().getByRole("button", { name: level }));
  const submit = panel().getByRole("button", { name: "完成本次通勤" });
  await waitFor(() => expect(submit).toBeEnabled());
  await act(async () => { fireEvent.click(submit); });
}

describe("A/D07 commute UI using the real recovery hook", () => {
  it("records REAL routes with no feedback or scores and keeps genuine zero arrival stress", async () => {
    render(<App />); await enterMap();
    expect(panel().getByRole("button", { name: "完成本次通勤" })).toBeDisabled();
    expect(screen.getByText("当前无有效评分，不展示舒适标签。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /选择 路线 B/ }));
    await selectAndComplete("0 · 非常轻松");
    await waitFor(() => expect(panel().getByText("通勤已记录。", { exact: true })).toBeInTheDocument());
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toMatchObject({ snapshotId, routeId: "r2", endStressLevel: 0 });
    expect(Object.keys(post.mock.calls[0][0]).sort()).toEqual(["snapshotId", "routeId", "operationId", "endStressLevel", "completedAt"].sort());
    expect(panel().getByText("暂无路线评分")).toBeInTheDocument();
    expect(screen.queryByText(/路线综合评分：0/)).not.toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "完成本次通勤" })).not.toBeInTheDocument();
    await waitFor(() => expect(trends).toHaveBeenCalledTimes(2));
    expect(history).toHaveBeenCalledTimes(2);
  });

  it("records DEMO snapshots while explicitly excluding them from real trends and commute history", async () => {
    compare.mockResolvedValue({ ...noScoring, routeSource: "DEMO", feedbackSource: "DEMO" });
    post.mockImplementation(async request => receipt(request, { routeSource: "DEMO" }));
    trends.mockResolvedValue({ ...emptyTrend, excludedDemoCommutes: 1 });
    render(<App />); await enterMap();
    expect(panel().getByText("演示通勤可以保存，但不会计入真实趋势或通勤历史。")).toBeInTheDocument();
    await selectAndComplete();
    await waitFor(() => expect(panel().getByText("这是演示通勤，不会计入真实趋势或通勤历史。")).toBeInTheDocument());
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.getByText("已从趋势中排除 1 次演示通勤。")).toBeInTheDocument();
    expect(panel().getByText("暂无路线评分")).toBeInTheDocument();
  });

  it.each([undefined, null, "not-a-server-snapshot"])("does not write without a valid snapshot (%s)", async invalid => {
    compare.mockResolvedValue({ ...noScoring, snapshotId: invalid });
    render(<App />); await enterMap();
    fireEvent.click(panel().getByRole("button", { name: "25 · 比较轻松" }));
    const submit = panel().getByRole("button", { name: "完成本次通勤" });
    expect(submit).toBeDisabled(); fireEvent.click(submit);
    expect(post).not.toHaveBeenCalled();
    expect(readPendingCommute().status).toBe("empty");
  });

  it("keeps recording disabled unless the D07 deployment gate is explicitly enabled", async () => {
    vi.stubEnv("VITE_COMMUTE_RECORDING_ENABLED", "false");
    render(<App />); await enterMap();
    const submit = panel().getByRole("button", { name: "完成本次通勤" });
    expect(submit).toBeDisabled(); expect(panel().queryByRole("group")).not.toBeInTheDocument();
    fireEvent.click(submit); expect(post).not.toHaveBeenCalled();
  });

  it("allows completion even when the initial trend query fails", async () => {
    trends.mockRejectedValueOnce(new ApiError("network", "趋势服务暂时离线"));
    render(<App />); await enterMap();
    await screen.findByText("趋势加载失败：趋势服务暂时离线");
    await selectAndComplete();
    await waitFor(() => expect(panel().getByText("通勤已记录。", { exact: true })).toBeInTheDocument());
    expect(post).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trends).toHaveBeenCalledTimes(2));
  });

  it("retries only GET queries after a confirmed write has a failed trend refresh", async () => {
    trends.mockResolvedValueOnce(emptyTrend).mockRejectedValueOnce(new ApiError("network", "刷新断网"))
      .mockResolvedValue(emptyTrend);
    render(<App />); await enterMap(); await selectAndComplete();
    await screen.findByText("通勤已确认，但后续查询刷新失败。请只刷新查询，无需再次提交。");
    expect(post).toHaveBeenCalledTimes(1);
    expect(panel().getByText("通勤已记录。", { exact: true })).toBeInTheDocument();
    await act(async () => { fireEvent.click(panel().getByRole("button", { name: "刷新趋势与历史" })); });
    await waitFor(() => expect(trends).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(history).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByText("通勤已确认，但后续查询刷新失败。请只刷新查询，无需再次提交。")).not.toBeInTheDocument());
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("shows automatic refresh progress and unlocks the next trip only when it finishes", async () => {
    const query = deferred<typeof emptyTrend>();
    trends.mockResolvedValueOnce(emptyTrend).mockReturnValueOnce(query.promise);
    render(<App />); await enterMap(); await selectAndComplete();
    await screen.findByText("通勤已记录。", { exact: true });
    expect(panel().getByRole("button", { name: "刷新中…" })).toBeDisabled();
    expect(panel().getByRole("button", { name: "开始下一次通勤" })).toBeDisabled();
    await act(async () => { query.resolve(emptyTrend); });
    await waitFor(() => expect(panel().getByRole("button", { name: "刷新趋势与历史" })).toBeEnabled());
    expect(panel().getByRole("button", { name: "开始下一次通勤" })).toBeEnabled();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("restores a lost receipt without POST and retries original content despite a new comparison", async () => {
    post.mockRejectedValueOnce(new ApiError("network", "回执丢失"));
    const first = render(<App />); await enterMap(); await selectAndComplete();
    await screen.findByRole("button", { name: "重试原通勤" });
    const original = post.mock.calls[0][0];
    first.unmount();
    compare.mockResolvedValue({ ...noScoring, snapshotId: nextSnapshotId });
    post.mockImplementation(async request => receipt(request, { status: "duplicate" }));
    render(<App />);
    await screen.findByRole("heading", { name: "路线预览" });
    await waitFor(() => expect(compare).toHaveBeenCalledTimes(2));
    expect(panel().getByRole("button", { name: "重试原通勤" })).toBeEnabled();
    expect(post).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole("button", { name: "进入地图" }));
    fireEvent.click(screen.getByRole("button", { name: /选择 路线 B/ }));
    expect(panel().queryByRole("button", { name: "完成本次通勤" })).not.toBeInTheDocument();
    expect(readPendingCommute()).toMatchObject({ status: "pending", pending: { request: original } });
    await act(async () => { fireEvent.click(panel().getByRole("button", { name: "重试原通勤" })); });
    await waitFor(() => expect(panel().getByText("这次通勤已记录，无需重复提交。")).toBeInTheDocument());
    expect(post.mock.calls.map(([request]) => request)).toEqual([original, original]);
    expect(original.snapshotId).not.toBe(nextSnapshotId);
    expect(readPendingCommute().status).toBe("empty");
  });

  it("does not refresh another visit to the same endpoints when a late receipt arrives", async () => {
    const pending = deferred<CommuteCompletion>(); post.mockReturnValueOnce(pending.promise);
    render(<App />); await enterMap(); await selectAndComplete();
    const original = post.mock.calls[0][0];
    fireEvent.click(screen.getByRole("button", { name: "修改起终点" }));
    expect(panel().getByText("正在确认通勤，请稍候…")).toBeInTheDocument();
    await enterMap();
    const trendCount = trends.mock.calls.length; const historyCount = history.mock.calls.length;
    await act(async () => { pending.resolve(receipt(original)); });
    await waitFor(() => expect(panel().getByText("通勤已记录。", { exact: true })).toBeInTheDocument());
    expect(post).toHaveBeenCalledTimes(1);
    expect(trends).toHaveBeenCalledTimes(trendCount);
    expect(history).toHaveBeenCalledTimes(historyCount);
  });

  it("keeps an expired operation available for reconciliation instead of creating a replacement", async () => {
    post.mockRejectedValue(new ApiError("business", "快照过期", { status: 410, code: "snapshot_expired" }));
    render(<App />); await enterMap(); await selectAndComplete();
    await screen.findByText("路线快照已失效，但不能据此判断上次通勤是否保存。请先核对记录，当前保留原操作信息。");
    const original = post.mock.calls[0][0];
    expect(panel().queryByRole("button", { name: "开始下一次通勤" })).not.toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "完成本次通勤" })).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(panel().getByRole("button", { name: "重试原通勤" })); });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][0]).toEqual(original);
    expect(readPendingCommute()).toMatchObject({ status: "pending", pending: { request: original } });
  });

  it("displays a genuine zero receipt score without treating it as missing", async () => {
    post.mockImplementation(async request => receipt(request, { selectedScore: 0 }));
    render(<App />); await enterMap(); await selectAndComplete();
    await waitFor(() => expect(panel().getByText("路线综合评分：0")).toBeInTheDocument());
    expect(panel().queryByText("暂无路线评分")).not.toBeInTheDocument();
  });
});
