import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { MapPage } from "../pages/MapPage";
import { DEFAULT_ORIGIN, DEFAULT_DESTINATION, WAYPOINTS } from "../config/campus";
import type { MapSurfaceProps } from "../features/map/MapSurface";
import { deferred, emptyTrend, jsonResponse, routeComparison } from "./fixtures";
import type { MapPageState } from "../types";

// A 的编排以 C 的公开 Props 为边界；C 内部手势与布局由其组件/E2E测试覆盖。
vi.mock("../features/map", () => ({ MapSurface: (props: MapSurfaceProps) => {
  useEffect(() => { props.onModeChange?.("offline"); }, [props.onModeChange]);
  return <div data-testid="map-contract">
    <span>{props.selectedRouteId}</span>
    <button type="button" onClick={() => props.onViewportChange("120.26,31.47,120.28,31.49", 17)}>移动视口</button>
    <button type="button" disabled={!props.feedbackEnabled}
      onClick={() => { void props.onFeedbackSubmit({ location: DEFAULT_ORIGIN.point, stressLevel: 50, tag: "NOISE" }).catch(() => {}); }}>提交反馈</button>
  </div>;
} }));

const baseState: MapPageState = { heatmapCells: [], loading: false, error: null, routeComparison: null, trend: null };
describe("MapPage", () => {
  it("shows loading", () => { render(<MapPage state={{ ...baseState, loading: true }} />); expect(screen.getByRole("status")).toHaveTextContent("正在加载热力图数据"); });
  it("shows an explicit query error", () => { render(<MapPage state={{ ...baseState, error: "加载失败" }} />); expect(screen.getByRole("alert")).toHaveTextContent("加载失败"); });
  it("shows the number of returned cells", () => {
    render(<MapPage state={{ ...baseState, heatmapCells: [{ cellId: "c", center: DEFAULT_ORIGIN.point, score: 0, confidence: 1, count: 1, dominantTag: "OTHER" }] }} />);
    expect(screen.getByRole("status", { name: "数据摘要" })).toHaveTextContent("1");
  });
  it("does not invent a summary for no cells", () => { render(<MapPage state={baseState} />); expect(screen.queryByRole("status", { name: "数据摘要" })).not.toBeInTheDocument(); });
  it("offers the map placeholder", () => { render(<MapPage state={baseState} />); expect(screen.getByText(/地图区域/)).toBeInTheDocument(); });
  it("renders the supplied map", () => { render(<MapPage state={baseState} mapSlot={<p>地图插槽</p>} />); expect(screen.getByText("地图插槽")).toBeInTheDocument(); });
});

let fetchMock: ReturnType<typeof vi.fn>;
function installBackend(overrides: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined = () => undefined) {
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const override = overrides(String(input), init); if (override !== undefined) return override;
    if (input.includes("/routes/compare")) return jsonResponse(routeComparison);
    if (input.includes("/commutes/trends")) return jsonResponse(emptyTrend);
    if (input.includes("/reports")) return jsonResponse({ status: "created", message: "已提交" }, 201);
    return jsonResponse([]);
  });
  vi.stubGlobal("fetch", fetchMock);
}
async function map() {
  fireEvent.click(screen.getByRole("button", { name: "查看路线" }));
  fireEvent.click(await screen.findByRole("button", { name: "进入地图" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "提交反馈" })).toBeEnabled());
}
const calls = (part: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(part));
beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/"); installBackend(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("成员 A 页面编排", () => {
  it("starts at selection without requesting routes, heatmap or trends", () => {
    render(<App />); expect(screen.getByRole("button", { name: "查看路线" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled(); expect(screen.queryByTestId("map-contract")).not.toBeInTheDocument();
  });
  it("submits selected non-default endpoints", async () => {
    render(<App />); fireEvent.click(within(screen.getByRole("group", { name: "选择终点" })).getByRole("button", { name: "图书馆" }));
    fireEvent.click(screen.getByRole("button", { name: "查看路线" }));
    await screen.findByRole("button", { name: "进入地图" });
    expect(JSON.parse(calls("/routes/compare")[0][1].body)).toEqual({ origin: DEFAULT_ORIGIN.point, destination: WAYPOINTS[2].point });
  });
  it("requests independent heatmap, trend and history queries only after entering map", async () => {
    render(<App />); fireEvent.click(screen.getByRole("button", { name: "查看路线" }));
    await screen.findByRole("button", { name: "进入地图" });
    expect(calls("/heatmap")).toHaveLength(0); expect(calls("/commutes/trends")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "进入地图" }));
    await waitFor(() => expect(calls("/routes/history")).toHaveLength(1));
    expect(calls("/heatmap").length).toBeGreaterThan(0); expect(calls("/commutes/trends")).toHaveLength(1);
  });
  it("keeps an unknown-provenance comparison scoreless and blocks legacy commute writes", async () => {
    render(<App />); await map();
    expect(screen.getByText("当前无有效评分，不展示舒适标签。")).toBeInTheDocument();
    expect(screen.queryByText("少心累")).not.toBeInTheDocument();
    const complete = screen.getByRole("button", { name: "完成本次通勤" });
    expect(complete).toBeDisabled(); fireEvent.click(complete); expect(calls("/commutes/complete")).toHaveLength(0);
  });
  it("passes C01 presentation states so verified real scores, including zero, remain visible after entering the map", async () => {
    const comparison = { ...routeComparison, routeSource: "REAL", feedbackSource: "REAL", scoringStatus: "VALID",
      routes: routeComparison.routes.map((route, index) => ({ ...route,
        stressExposure: index === 0 ? 0 : 20, stressScore: index === 0 ? 0 : 22 })) };
    installBackend((url) => url.includes("/routes/compare") ? jsonResponse(comparison) : undefined);
    render(<App />); await map();
    const panel = screen.getByTestId("route-panel");
    const zeroCard = within(panel).getByRole("button", { name: /选择 路线 A/ });
    expect(within(zeroCard).getByText("综合评分").parentElement).toHaveTextContent(/^0\s*综合评分$/);
    expect(within(zeroCard).getByText("环境指数").parentElement).toHaveTextContent(/^0\s*环境指数$/);
    expect(within(panel).getByText("22", { exact: true })).toBeInTheDocument();
    expect(within(panel).getByText("少心累", { exact: true })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: /选择 路线 B/ }));
    expect(screen.getByTestId("map-contract")).toHaveTextContent("r2");
    expect(screen.getByRole("button", { name: "完成本次通勤" })).toBeDisabled();
    expect(calls("/commutes/complete")).toHaveLength(0);
  });
  it("selects the same route across choices and map then clears it on replanning", async () => {
    render(<App />); await map(); fireEvent.click(screen.getByRole("button", { name: /选择 路线 B/ }));
    expect(screen.getByTestId("map-contract")).toHaveTextContent("r2");
    fireEvent.click(screen.getByRole("button", { name: "重新规划" }));
    fireEvent.click(await screen.findByRole("button", { name: "进入地图" }));
    expect(screen.getByTestId("map-contract")).toHaveTextContent("r1");
  });
  it("returns with selected endpoints and can plan a new trip", async () => {
    render(<App />); await map(); fireEvent.click(screen.getByRole("button", { name: "修改起终点" }));
    expect(within(screen.getByRole("group", { name: "选择终点" })).getByRole("button", { name: DEFAULT_DESTINATION.name })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(screen.getByRole("group", { name: "选择终点" })).getByRole("button", { name: "图书馆" }));
    fireEvent.click(screen.getByRole("button", { name: "查看路线" }));
    await screen.findByRole("button", { name: "进入地图" });
    expect(JSON.parse(calls("/routes/compare").at(-1)![1].body).destination).toEqual(WAYPOINTS[2].point);
  });
  it("requires explicit demo selection and treats offline base map independently from a recovered backend", async () => {
    installBackend((url) => url.includes("/routes/compare") ? Promise.reject(new TypeError("offline")) : undefined);
    render(<App />); fireEvent.click(screen.getByRole("button", { name: "查看路线" }));
    await screen.findByRole("alert"); expect(screen.queryByTestId("map-contract")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看匹配的演示路线" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "提交反馈" })).toBeEnabled());
    expect(screen.getByText(/底图：离线底图/)).toHaveTextContent("数据服务：可连接");
    expect(screen.getByRole("button", { name: "完成本次通勤" })).toBeDisabled();
    expect(screen.queryByText("少心累")).not.toBeInTheDocument();
  });
  it("retries only the heatmap after a saved report and failed refresh", async () => {
    let heatmapCount = 0;
    installBackend((url) => url.includes("/heatmap") && ++heatmapCount === 2 ? jsonResponse({ code: "internal_error" }, 500) : undefined);
    render(<App />); await map();
    fireEvent.click(screen.getByRole("button", { name: "移动视口" }));
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    expect(await screen.findByText(/反馈已提交，但地图刷新失败/)).toBeInTheDocument();
    expect(calls("/reports")).toHaveLength(1);
    expect(String(calls("/heatmap").at(-1)![0])).toContain("zoom=17");
    fireEvent.click(screen.getByRole("button", { name: "刷新地图" }));
    await waitFor(() => expect(calls("/heatmap")).toHaveLength(3));
    expect(calls("/reports")).toHaveLength(1);
  });
  it("recognizes duplicate reports without inventing a new write or heatmap update", async () => {
    installBackend((url) => url.includes("/reports") ? jsonResponse({ status: "duplicate", message: "已提交过" }, 409) : undefined);
    render(<App />); await map(); const before = calls("/heatmap").length;
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    expect(await screen.findByText(/这条反馈已提交过/)).toBeInTheDocument();
    expect(calls("/reports")).toHaveLength(1); expect(calls("/heatmap")).toHaveLength(before);
  });
  it("prevents simultaneous report writes", async () => {
    const pending = deferred<Response>(); installBackend((url) => url.includes("/reports") ? pending.promise : undefined);
    render(<App />); await map(); const button = screen.getByRole("button", { name: "提交反馈" });
    fireEvent.click(button); fireEvent.click(button); expect(calls("/reports")).toHaveLength(1);
    await act(async () => pending.resolve(jsonResponse({ status: "created", message: "已保存" }, 201)));
  });
  it("retains old trend data when refreshing it fails", async () => {
    let count = 0; installBackend((url) => url.includes("/commutes/trends")
      ? ++count === 1 ? jsonResponse({ ...emptyTrend, totalCommutes: 2, recommendation: "已有趋势" }) : jsonResponse({}, 500) : undefined);
    render(<App />); await map(); await screen.findByText(/已有趋势/);
    fireEvent.click(screen.getByRole("button", { name: "重试或刷新趋势" }));
    expect(await screen.findByText(/显示上次趋势，刷新失败/)).toBeInTheDocument(); expect(screen.getByText(/已有趋势/)).toBeInTheDocument();
  });
  it("does not present a failed initial trend query as a successful empty result", async () => {
    installBackend((url) => url.includes("/commutes/trends") ? jsonResponse({}, 500) : undefined);
    render(<App />); await map();
    expect(await screen.findByText(/趋势加载失败/)).toBeInTheDocument();
    expect(screen.queryByText("暂无通勤记录。")).not.toBeInTheDocument();
    expect(screen.queryByText("暂无通勤趋势数据")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trend-panel")).not.toBeInTheDocument();
  });
  it("restores only endpoints on refresh and queries routes again", async () => {
    localStorage.setItem("commute-trip-v1", JSON.stringify({ version: 1, stage: "map", selection: {
      origin: DEFAULT_ORIGIN.point, destination: WAYPOINTS[2].point, originName: "学生公寓区", destName: "图书馆" }, result: { selectedScore: 100 } }));
    render(<App />); await screen.findByRole("button", { name: "进入地图" });
    expect(calls("/routes/compare")).toHaveLength(1); expect(calls("/heatmap")).toHaveLength(0);
  });
  it("uses a history entry only to requery its endpoints", async () => {
    installBackend((url) => url.includes("/routes/history") ? jsonResponse([{ id: "h", origin: DEFAULT_ORIGIN.point,
      destination: WAYPOINTS[2].point, createdAt: "2026-10-18T00:00:00Z", result: { routes: [{ label: "不可复用的旧评分" }] } }]) : undefined);
    render(<App />); await map(); const recent = screen.getByRole("region", { name: "最近查询" });
    fireEvent.click(await within(recent).findByRole("button", { name: "重新规划" }));
    await screen.findByRole("button", { name: "进入地图" });
    expect(JSON.parse(calls("/routes/compare").at(-1)![1].body).destination).toEqual(WAYPOINTS[2].point);
    expect(screen.queryByText("不可复用的旧评分")).not.toBeInTheDocument();
  });
});
