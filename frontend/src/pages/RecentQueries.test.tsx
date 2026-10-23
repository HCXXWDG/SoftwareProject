import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentQueries } from "./RecentQueries";
import type { AsyncQueryState } from "../hooks/useTrendsHistory";
import type { RouteQueryHistory } from "../services/history";
import { DEFAULT_DESTINATION, DEFAULT_ORIGIN } from "../config/serviceArea";

const entry: RouteQueryHistory = {
  id: "query-1",
  origin: DEFAULT_ORIGIN.point,
  destination: DEFAULT_DESTINATION.point,
  createdAt: "2026-10-18T02:00:00Z",
};
const baseState: AsyncQueryState<RouteQueryHistory[]> = {
  status: "success", data: [entry], error: null, refreshing: false, refreshError: null,
};
afterEach(cleanup);

describe("RecentQueries", () => {
  it("replans with endpoint copies and never submits a cached comparison", () => {
    const onReplan = vi.fn();
    render(<RecentQueries state={baseState} onRetry={vi.fn()} onReplan={onReplan} />);
    expect(screen.getByText("南禅寺 → 崇安寺")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新规划" }));
    expect(onReplan).toHaveBeenCalledWith(entry.origin, entry.destination);
    expect(onReplan.mock.calls[0][0]).not.toBe(entry.origin);
  });

  it.each(["origin", "destination"] as const)("keeps an old out-of-area %s visible but blocks replanning it", (endpoint) => {
    const onReplan = vi.fn();
    const oldEntry = { ...entry, [endpoint]: { longitude: 120.27351, latitude: 31.475328 } };
    render(<RecentQueries state={{ ...baseState, data: [oldEntry] }} onRetry={vi.fn()} onReplan={onReplan} />);
    expect(screen.getByText(/此历史行程不在当前梁溪区地图范围/)).toBeInTheDocument();
    expect(screen.getByText(/120\.27351, 31\.47533/)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "重新规划" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onReplan).not.toHaveBeenCalled();
  });

  it("shows initial failures with a retry action", () => {
    const onRetry = vi.fn();
    render(<RecentQueries state={{ ...baseState, status: "error", data: null, error: "服务超时" }} onRetry={onRetry} onReplan={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("服务超时");
    fireEvent.click(screen.getByRole("button", { name: "重试查询历史" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "重新规划" })).not.toBeInTheDocument();
  });

  it("keeps old endpoint actions after a failed refresh", () => {
    const onRetry = vi.fn();
    render(<RecentQueries state={{ ...baseState, refreshError: "网络异常" }} onRetry={onRetry} onReplan={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("仍显示上次记录");
    expect(screen.getByRole("button", { name: "重新规划" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "重试刷新历史" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("distinguishes empty history and loading", () => {
    const props = { onRetry: vi.fn(), onReplan: vi.fn() };
    const { rerender } = render(<RecentQueries {...props} state={{ ...baseState, status: "loading", data: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在加载");
    expect(screen.getByRole("button", { name: "刷新历史" })).toBeDisabled();
    rerender(<RecentQueries {...props} state={{ ...baseState, status: "empty", data: [] }} />);
    expect(screen.getByText(/暂无查询历史/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
