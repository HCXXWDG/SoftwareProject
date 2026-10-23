import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { MapPage } from "./MapPage";
import type { MapPageState } from "../types";

const state: MapPageState = { heatmapCells: [], loading: true, error: null, routeComparison: null, trend: null };
afterEach(cleanup);

describe("interactive map loading presentation", () => {
  it("uses the map slot's loading feedback while its controls remain actionable", () => {
    const close = vi.fn();
    render(<MapPage state={state} mapSlot={<section><p role="status">正在更新情绪热力图</p>
      <button onClick={close}>关闭热力点详情</button></section>} />);
    expect(screen.queryByText("正在加载热力图数据…")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在更新情绪热力图");
    fireEvent.click(screen.getByRole("button", { name: "关闭热力点详情" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("retains the initial loading state when no interactive map is supplied", () => {
    render(<MapPage state={state} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在加载热力图数据…");
  });
});

describe("heatmap source presentation", () => {
  it("explains a successful empty real query and offers an explicit demo choice", () => {
    const change = vi.fn();
    render(<MapPage state={{ ...state, loading: false }} heatmapScope="REAL_ONLY" onHeatmapScopeChange={change} />);
    expect(screen.getByText(/近 7 天暂无真实反馈，因此暂时没有热力点/)).toHaveTextContent("记录此处感受");
    expect(screen.getByRole("button", { name: "真实反馈" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "演示热力图" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "演示热力图" }));
    expect(change).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledWith("SIMULATED_ONLY");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    { loading: true, error: null },
    { loading: false, error: "演示请求失败" },
    { loading: false, error: null },
  ])("keeps the demo provenance visible throughout loading/error/empty %#", phase => {
    render(<MapPage state={{ ...state, ...phase }} heatmapScope="SIMULATED_ONLY" onHeatmapScopeChange={vi.fn()} />);
    expect(screen.getByRole("region", { name: "热力图来源" })).toHaveTextContent("演示热力图（模拟反馈）。不影响路线规划、评分或真实统计。");
    expect(screen.getByRole("button", { name: "演示热力图" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/暂无真实反馈，因此/)).not.toBeInTheDocument();
  });

  it("labels loaded demo cells and switches back to real without changing route state", () => {
    const change = vi.fn();
    const heatmapCells = [{ cellId: "demo", center: { longitude: 120.27, latitude: 31.48 }, score: 0, confidence: 1, count: 1, dominantTag: "QUIET" as const }];
    render(<MapPage state={{ ...state, loading: false, heatmapCells }} heatmapScope="SIMULATED_ONLY" onHeatmapScopeChange={change} />);
    expect(screen.getByRole("status", { name: "数据摘要" })).toHaveTextContent("1个热力图单元格已加载（模拟反馈）");
    fireEvent.click(screen.getByRole("button", { name: "真实反馈" }));
    expect(change).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledWith("REAL_ONLY");
  });

  it("does not mistake a loading or failed query for absence of real feedback", () => {
    const { rerender } = render(<MapPage state={state} />);
    expect(screen.queryByText(/暂无真实反馈，因此/)).not.toBeInTheDocument();
    rerender(<MapPage state={{ ...state, loading: false, error: "连接失败" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("连接失败");
    expect(screen.queryByText(/暂无真实反馈，因此/)).not.toBeInTheDocument();
  });
});
