import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTrends } from "../services/commute";
import { ApiError } from "../services/api";
import { fetchRouteHistory } from "../services/history";
import { useTrendsHistory } from "./useTrendsHistory";
import type { TrendResult } from "../types";

vi.mock("../services/commute", () => ({ fetchTrends: vi.fn() }));
vi.mock("../services/history", () => ({ fetchRouteHistory: vi.fn() }));

const trend: TrendResult = {
  points: [{ date: "2026-10-18", averageStress: 25, commuteCount: 1 }],
  recommendation: "继续观察",
  totalCommutes: 1,
};
const emptyTrend: TrendResult = { points: [], recommendation: "", totalCommutes: 0 };
const historyEntry = {
  id: "query-1",
  origin: { longitude: 120.27351, latitude: 31.475328 },
  destination: { longitude: 120.274319, latitude: 31.483275 },
  createdAt: "2026-10-18T02:00:00Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.mocked(fetchTrends).mockReset().mockResolvedValue(trend);
  vi.mocked(fetchRouteHistory).mockReset().mockResolvedValue([historyEntry]);
});
afterEach(cleanup);

describe("useTrendsHistory", () => {
  it("does not query until enabled and passes explicit date options and abort signals", async () => {
    const { result, rerender } = renderHook(({ enabled }) => useTrendsHistory(enabled, { days: 14, timezone: "UTC", historyLimit: 5 }), { initialProps: { enabled: false } });
    expect(result.current.trends.status).toBe("idle");
    expect(result.current.history.status).toBe("idle");
    expect(fetchTrends).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.trends.status).toBe("success"));
    expect(fetchTrends).toHaveBeenCalledWith(14, "UTC", expect.any(AbortSignal));
    expect(fetchRouteHistory).toHaveBeenCalledWith(5, expect.any(AbortSignal));
  });

  it("distinguishes successful empty data from initial failures independently", async () => {
    vi.mocked(fetchTrends).mockResolvedValue(emptyTrend);
    vi.mocked(fetchRouteHistory).mockRejectedValueOnce(new Error("历史服务暂不可用"));
    const { result } = renderHook(() => useTrendsHistory(true));
    await waitFor(() => expect(result.current.history.status).toBe("error"));
    expect(result.current.trends.status).toBe("empty");
    expect(result.current.trends.error).toBeNull();
    expect(result.current.history.data).toBeNull();
    expect(result.current.history.error).toBe("历史服务暂不可用");
    vi.mocked(fetchRouteHistory).mockResolvedValueOnce([]);
    await act(async () => { expect(await result.current.reloadHistory()).toBe(true); });
    expect(result.current.history.status).toBe("empty");
    expect(result.current.history.error).toBeNull();
  });

  it("retains previous trends when refresh fails and supports an independent retry", async () => {
    const { result } = renderHook(() => useTrendsHistory(true));
    await waitFor(() => expect(result.current.trends.status).toBe("success"));
    vi.mocked(fetchTrends).mockRejectedValueOnce(new Error("刷新超时"));
    await act(async () => { expect(await result.current.reloadTrends()).toBe(false); });
    expect(result.current.trends).toMatchObject({ status: "success", data: trend, error: null, refreshing: false, refreshError: "刷新超时" });
    expect(fetchRouteHistory).toHaveBeenCalledTimes(1);
    await act(async () => { expect(await result.current.reloadTrends()).toBe(true); });
    expect(result.current.trends.refreshError).toBeNull();
    expect(result.current.trends.data).toEqual(trend);
  });

  it("preserves empty history and reports a refresh error separately", async () => {
    vi.mocked(fetchRouteHistory).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useTrendsHistory(true));
    await waitFor(() => expect(result.current.history.status).toBe("empty"));
    vi.mocked(fetchRouteHistory).mockRejectedValueOnce(new Error("网络异常"));
    await act(async () => { await result.current.reloadHistory(); });
    expect(result.current.history).toMatchObject({ status: "empty", data: [], error: null, refreshError: "网络异常" });
  });

  it("keeps previous results visible while refreshing", async () => {
    const { result } = renderHook(() => useTrendsHistory(true));
    await waitFor(() => expect(result.current.trends.status).toBe("success"));
    const next = deferred<TrendResult>();
    vi.mocked(fetchTrends).mockReturnValueOnce(next.promise);
    let reloading!: Promise<boolean>;
    act(() => { reloading = result.current.reloadTrends(); });
    expect(result.current.trends).toMatchObject({ status: "success", data: trend, refreshing: true });
    await act(async () => { next.resolve(emptyTrend); await reloading; });
    expect(result.current.trends.status).toBe("empty");
    expect(result.current.trends.refreshing).toBe(false);
  });

  it("aborts superseded requests and ignores late results even if the provider ignores cancellation", async () => {
    const first = deferred<TrendResult>();
    const second = deferred<TrendResult>();
    vi.mocked(fetchTrends).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useTrendsHistory(true));
    const firstSignal = vi.mocked(fetchTrends).mock.calls[0][2];
    let reloading!: Promise<boolean>;
    act(() => { reloading = result.current.reloadTrends(); });
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => { second.resolve(emptyTrend); await reloading; });
    await act(async () => { first.resolve(trend); await first.promise; });
    expect(result.current.trends).toMatchObject({ status: "empty", data: emptyTrend });
  });

  it.each([
    new DOMException("Cancelled", "AbortError"),
    new ApiError("cancelled", "请求已取消"),
  ])("does not expose cancellation as an initial failure %#", async (error) => {
    vi.mocked(fetchTrends).mockRejectedValueOnce(error);
    const { result } = renderHook(() => useTrendsHistory(true));
    await waitFor(() => expect(result.current.history.status).toBe("success"));
    expect(result.current.trends).toMatchObject({ status: "idle", error: null, refreshError: null });
  });

  it("cancels queries on disable and ignores their late completion", async () => {
    const request = deferred<TrendResult>();
    vi.mocked(fetchTrends).mockReturnValueOnce(request.promise);
    const { result, rerender } = renderHook(({ enabled }) => useTrendsHistory(enabled), { initialProps: { enabled: true } });
    const signal = vi.mocked(fetchTrends).mock.calls[0][2];
    rerender({ enabled: false });
    expect(signal?.aborted).toBe(true);
    await act(async () => { request.resolve(trend); await request.promise; });
    expect(result.current.trends.status).toBe("idle");
    expect(result.current.trends.data).toBeNull();
  });
});
