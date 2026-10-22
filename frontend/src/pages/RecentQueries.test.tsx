import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentQueries } from "./RecentQueries";
import type { AsyncQueryState } from "../hooks/useTrendsHistory";
import type { RouteQueryHistory } from "../services/history";

const entry: RouteQueryHistory = {
  id: "query-1",
  origin: { longitude: 120.27351, latitude: 31.475328 },
  destination: { longitude: 120.274319, latitude: 31.483275 },
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
    expect(screen.getByText("学生公寓区 → 第一教学楼")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新规划" }));
    expect(onReplan).toHaveBeenCalledWith(entry.origin, entry.destination);
    expect(onReplan.mock.calls[0][0]).not.toBe(entry.origin);
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
