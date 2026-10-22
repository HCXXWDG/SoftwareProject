import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoutePreviewPage } from "./RoutePreviewPage";
import { DEFAULT_DESTINATION, DEFAULT_ORIGIN, WAYPOINTS } from "../config/campus";
import { compareRoutes } from "../services/route";
import { ApiError } from "../services/api";
import { deferred, routeComparison } from "../test/fixtures";
import type { RouteComparison } from "../types";

vi.mock("../services/route", () => ({ compareRoutes: vi.fn() }));
const request = vi.mocked(compareRoutes);
const baseProps = { origin: DEFAULT_ORIGIN.point, destination: DEFAULT_DESTINATION.point,
  originName: DEFAULT_ORIGIN.name, destName: DEFAULT_DESTINATION.name };
beforeEach(() => { vi.clearAllMocks(); request.mockResolvedValue(routeComparison); });

describe("RoutePreviewPage", () => {
  it("shows loading and allows entering the returned route", async () => {
    const pending = deferred<RouteComparison>(); request.mockReturnValue(pending.promise);
    const enter = vi.fn(); render(<RoutePreviewPage {...baseProps} onEnterMap={enter} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在获取路线数据");
    await act(async () => pending.resolve(routeComparison));
    fireEvent.click(screen.getByRole("button", { name: "进入地图" }));
    expect(enter).toHaveBeenCalledWith(routeComparison, false);
    expect(request).toHaveBeenCalledWith({ origin: baseProps.origin, destination: baseProps.destination }, expect.any(AbortSignal));
  });
  it("retains real errors and retries rather than silently entering demo", async () => {
    request.mockRejectedValueOnce(new ApiError("network", "网络连接失败"));
    render(<RoutePreviewPage {...baseProps} onEnterMap={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("网络连接失败");
    expect(screen.queryByText(routeComparison.routes[0].label)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText(routeComparison.routes[0].label)).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("enters only explicitly requested matching demo and never reports valid scoring", async () => {
    request.mockRejectedValue(new ApiError("network", "离线"));
    const enter = vi.fn(); render(<RoutePreviewPage {...baseProps} onEnterMap={enter} />);
    fireEvent.click(await screen.findByRole("button", { name: "查看匹配的演示路线" }));
    expect(enter).toHaveBeenCalledWith(expect.objectContaining({ routeSource: "DEMO", scoringStatus: "UNAVAILABLE" }), true);
  });
  it("never substitutes default demo for a different destination", async () => {
    request.mockRejectedValue(new Error("离线"));
    render(<RoutePreviewPage {...baseProps} destination={WAYPOINTS[2].point} onEnterMap={vi.fn()} />);
    expect(await screen.findByText("这组起终点没有配置演示路线。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看匹配的演示路线" })).not.toBeInTheDocument();
  });
  it("cancels superseded requests and ignores late responses even when fetch ignores abort", async () => {
    const old = deferred<RouteComparison>(); const recent = deferred<RouteComparison>();
    request.mockReturnValueOnce(old.promise).mockReturnValueOnce(recent.promise);
    const { rerender } = render(<RoutePreviewPage {...baseProps} onEnterMap={vi.fn()} />);
    const oldSignal = request.mock.calls[0][1];
    rerender(<RoutePreviewPage {...baseProps} destination={WAYPOINTS[2].point} onEnterMap={vi.fn()} />);
    expect(oldSignal?.aborted).toBe(true);
    const next = { ...routeComparison, routes: [{ ...routeComparison.routes[0], label: "图书馆新路线" }] };
    await act(async () => recent.resolve(next));
    await act(async () => old.resolve(routeComparison));
    expect(screen.getByText("图书馆新路线")).toBeInTheDocument();
    expect(screen.queryByText(routeComparison.routes[1].label)).not.toBeInTheDocument();
  });
  it("does not display cancellation as failure", async () => {
    request.mockRejectedValue(new ApiError("cancelled", "取消"));
    render(<RoutePreviewPage {...baseProps} onEnterMap={vi.fn()} />);
    await act(async () => {});
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("handles zero candidates without a map entry", async () => {
    request.mockResolvedValue({ ...routeComparison, routes: [] });
    render(<RoutePreviewPage {...baseProps} onEnterMap={vi.fn()} />);
    expect(await screen.findByText(/没有可用路线/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "进入地图" })).not.toBeInTheDocument();
  });
  it("shows a single short route and hides unverified scores and recommendation", async () => {
    request.mockResolvedValue({ ...routeComparison, routes: [{ ...routeComparison.routes[0], durationSeconds: 25 }] });
    render(<RoutePreviewPage {...baseProps} onEnterMap={vi.fn()} />);
    expect(await screen.findByText("预计 不足一分钟")).toBeInTheDocument();
    expect(screen.queryByText(/心累指数/)).not.toBeInTheDocument();
    expect(screen.queryByText(routeComparison.recommendation)).not.toBeInTheDocument();
  });
  it("displays a valid zero score only with explicit real provenance", async () => {
    request.mockResolvedValue({ ...routeComparison, routeSource: "REAL", feedbackSource: "REAL", scoringStatus: "VALID",
      routes: [{ ...routeComparison.routes[0], stressScore: 0 }] });
    render(<RoutePreviewPage {...baseProps} onEnterMap={vi.fn()} />);
    expect(await screen.findByText("心累指数 0")).toBeInTheDocument();
  });
  it("allows a nullable demo result into the map without inventing scores or comfort labels", async () => {
    const demo: RouteComparison = { ...routeComparison, routeSource: "DEMO", feedbackSource: "NONE", scoringStatus: "UNAVAILABLE",
      leastStressfulRouteId: null, recommendation: "", recommendAlternative: false,
      routes: routeComparison.routes.map((route) => ({ ...route, stressExposure: null, stressScore: null, leastStressful: false })) };
    request.mockResolvedValue(demo);
    const enter = vi.fn(); render(<RoutePreviewPage {...baseProps} onEnterMap={enter} />);
    expect(await screen.findByText("演示路线 · 评分不可用")).toBeInTheDocument();
    expect(screen.queryByText(/心累指数|最少心累/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "进入地图" }));
    expect(enter).toHaveBeenCalledWith(demo, true);
  });
  it("distinguishes a provider outage from a successful empty route result", async () => {
    request.mockRejectedValue(new ApiError("http", "步行路线服务暂时不可用，请重试或查看匹配的演示路线。", { status: 503, code: "route_provider_unavailable" }));
    render(<RoutePreviewPage {...baseProps} onEnterMap={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("步行路线服务暂时不可用");
    expect(screen.getByRole("button", { name: "重试" })).toBeEnabled();
    expect(screen.queryByText(/没有可用路线/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "进入地图" })).not.toBeInTheDocument();
  });
  it("returns to endpoint selection through the supplied navigation action", () => {
    request.mockReturnValue(new Promise(() => {}));
    const back = vi.fn(); render(<RoutePreviewPage {...baseProps} onEnterMap={vi.fn()} onBack={back} />);
    fireEvent.click(screen.getByRole("button", { name: "修改起终点" })); expect(back).toHaveBeenCalledOnce();
  });
});
