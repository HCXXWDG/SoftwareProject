import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPUS_DEFAULT_BBOX } from "../config/campus";
import { ApiError, type ApiErrorKind } from "../services/api";
import { fetchHeatmap } from "../services/heatmap";
import type { BackendStatus, HeatmapCell } from "../types";
import { useHeatmapQuery, type HeatmapRefreshResult } from "./useHeatmapQuery";

vi.mock("../services/heatmap", () => ({ fetchHeatmap: vi.fn() }));

const query = vi.mocked(fetchHeatmap);
const firstViewport = "120.26,31.47,120.28,31.49";
const latestViewport = "120.27,31.48,120.29,31.50";

function cell(cellId: string, score: number): HeatmapCell {
  return {
    cellId,
    center: { longitude: 120.27351, latitude: 31.475328 },
    score,
    confidence: 0.7,
    count: 3,
    dominantTag: "NOISE",
  };
}

const originalCells = [cell("before-report", 50)];
const refreshedCells = [cell("after-report", 25)];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle(action?: () => void) {
  await act(async () => {
    action?.();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  query.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useHeatmapQuery", () => {
  it("does not query or schedule a query while disabled", async () => {
    const onBackend = vi.fn<(status: BackendStatus) => void>();
    const { result } = renderHook(() => useHeatmapQuery(false, onBackend));

    act(() => result.current.updateViewport(latestViewport, 17));
    await act(async () => {
      expect(await result.current.refresh()).toBe("cancelled");
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(query).not.toHaveBeenCalled();
    expect(onBackend).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ cells: [], loading: false, error: null });
  });

  it("loads the default viewport and exposes the first successful result", async () => {
    const response = deferred<HeatmapCell[]>();
    query.mockReturnValueOnce(response.promise);
    const onBackend = vi.fn();
    const { result } = renderHook(() => useHeatmapQuery(true, onBackend));

    expect(query).toHaveBeenCalledWith(CAMPUS_DEFAULT_BBOX, 16, 168, expect.any(AbortSignal));
    expect(result.current.loading).toBe(true);
    await settle(() => response.resolve(originalCells));

    expect(result.current).toMatchObject({ cells: originalCells, loading: false, error: null });
    expect(onBackend).toHaveBeenLastCalledWith("available");
  });

  it("refreshes the latest viewport after a report even before its debounce runs", async () => {
    query.mockResolvedValueOnce(originalCells).mockResolvedValue(refreshedCells);
    const { result } = renderHook(() => useHeatmapQuery(true, vi.fn()));
    await settle();

    act(() => result.current.updateViewport(latestViewport, 18));
    expect(query).toHaveBeenCalledTimes(1);
    await act(async () => {
      // The parent calls refresh after a successful report; this must remain a GET only.
      expect(await result.current.refresh()).toBe("success");
    });

    expect(query).toHaveBeenLastCalledWith(latestViewport, 18, 168, expect.any(AbortSignal));
    expect(result.current.cells).toEqual(refreshedCells);
    expect(result.current.error).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("debounces rapid viewport changes to a query for the last bbox and zoom", async () => {
    query.mockResolvedValue(originalCells);
    const { result } = renderHook(() => useHeatmapQuery(true, vi.fn()));
    await settle();

    act(() => result.current.updateViewport(firstViewport, 16));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    act(() => result.current.updateViewport(latestViewport, 17));
    await act(async () => { await vi.advanceTimersByTimeAsync(299); });
    expect(query).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith(latestViewport, 17, 168, expect.any(AbortSignal));
  });

  it("ignores an old success during the new viewport debounce window", async () => {
    const oldResponse = deferred<HeatmapCell[]>();
    query.mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce(refreshedCells);
    const onBackend = vi.fn();
    const { result } = renderHook(() => useHeatmapQuery(true, onBackend));
    const oldSignal = query.mock.calls[0][3]!;

    act(() => result.current.updateViewport(latestViewport, 17));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await settle(() => oldResponse.resolve(originalCells));

    expect(result.current).toMatchObject({ cells: [], loading: true, error: null });
    expect(onBackend).not.toHaveBeenCalled();
    expect(oldSignal.aborted).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current).toMatchObject({ cells: refreshedCells, loading: false, error: null });
    expect(query).toHaveBeenLastCalledWith(latestViewport, 17, 168, expect.any(AbortSignal));
  });

  it("ignores an old failure during the new viewport debounce window", async () => {
    const oldResponse = deferred<HeatmapCell[]>();
    query.mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce(refreshedCells);
    const onBackend = vi.fn();
    const { result } = renderHook(() => useHeatmapQuery(true, onBackend));

    act(() => result.current.updateViewport(latestViewport, 17));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await settle(() => oldResponse.reject(new ApiError("network", "旧视口请求连接失败")));

    expect(result.current).toMatchObject({ cells: [], loading: true, error: null });
    expect(onBackend).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current).toMatchObject({ cells: refreshedCells, loading: false, error: null });
    expect(onBackend.mock.calls).toEqual([["available"]]);
  });

  it("returns cancelled for a report refresh superseded before the debounce fires", async () => {
    const afterReport = deferred<HeatmapCell[]>();
    query.mockResolvedValueOnce(originalCells).mockReturnValueOnce(afterReport.promise).mockResolvedValueOnce(refreshedCells);
    const onBackend = vi.fn();
    const { result } = renderHook(() => useHeatmapQuery(true, onBackend));
    await settle();
    onBackend.mockClear();
    let reportRefresh!: Promise<HeatmapRefreshResult>;
    act(() => { reportRefresh = result.current.refresh(); });

    act(() => result.current.updateViewport(latestViewport, 18));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await settle(() => afterReport.resolve([cell("stale-report-refresh", 75)]));

    expect(await reportRefresh).toBe("cancelled");
    expect(result.current).toMatchObject({ cells: originalCells, loading: true, error: null });
    expect(onBackend).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current).toMatchObject({ cells: refreshedCells, loading: false, error: null });
  });

  it("does not cancel or postpone a request when the effective viewport is unchanged", async () => {
    const response = deferred<HeatmapCell[]>();
    query.mockResolvedValueOnce(originalCells).mockReturnValueOnce(response.promise);
    const { result } = renderHook(() => useHeatmapQuery(true, vi.fn()));
    await settle();

    act(() => result.current.updateViewport(latestViewport, 17));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    act(() => result.current.updateViewport("120.270,31.480,120.290,31.500", 17));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(query).toHaveBeenCalledTimes(2);
    const signal = query.mock.calls[1][3]!;
    act(() => result.current.updateViewport(latestViewport, 17));
    expect(signal.aborted).toBe(false);
    await settle(() => response.resolve(refreshedCells));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(query).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ cells: refreshedCells, loading: false, error: null });
  });

  it("keeps the newest result when an older query ignores abort and resolves late", async () => {
    const oldResponse = deferred<HeatmapCell[]>();
    const latestResponse = deferred<HeatmapCell[]>();
    query.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(latestResponse.promise);
    const onBackend = vi.fn();
    const { result } = renderHook(() => useHeatmapQuery(true, onBackend));
    const oldSignal = query.mock.calls[0][3]!;

    act(() => result.current.updateViewport(latestViewport, 17));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(oldSignal.aborted).toBe(true);
    await settle(() => latestResponse.resolve(refreshedCells));
    await settle(() => oldResponse.resolve(originalCells));

    expect(result.current).toMatchObject({ cells: refreshedCells, loading: false, error: null });
    expect(onBackend).toHaveBeenCalledTimes(1);
    expect(onBackend).toHaveBeenCalledWith("available");
  });

  it("does not replace a newer success with an older failed request", async () => {
    const oldResponse = deferred<HeatmapCell[]>();
    query.mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce(refreshedCells);
    const onBackend = vi.fn();
    const { result } = renderHook(() => useHeatmapQuery(true, onBackend));

    act(() => result.current.updateViewport(latestViewport, 17));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await settle(() => oldResponse.reject(new ApiError("network", "旧请求连接失败")));

    expect(result.current).toMatchObject({ cells: refreshedCells, loading: false, error: null });
    expect(onBackend.mock.calls).toEqual([["available"]]);
  });

  it("returns cancelled when a post-report refresh is superseded by the latest viewport query", async () => {
    const afterReport = deferred<HeatmapCell[]>();
    const afterViewport = deferred<HeatmapCell[]>();
    query.mockResolvedValueOnce(originalCells)
      .mockReturnValueOnce(afterReport.promise)
      .mockReturnValueOnce(afterViewport.promise);
    const onBackend = vi.fn();
    const { result } = renderHook(() => useHeatmapQuery(true, onBackend));
    await settle();
    onBackend.mockClear();
    let reportRefresh!: Promise<HeatmapRefreshResult>;
    act(() => { reportRefresh = result.current.refresh(); });
    const reportSignal = query.mock.calls[1][3]!;

    act(() => result.current.updateViewport(latestViewport, 18));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(reportSignal.aborted).toBe(true);
    await settle(() => afterReport.resolve([cell("superseded-report-refresh", 75)]));

    // A write already succeeded: replacement by a newer query is not a refresh failure.
    expect(await reportRefresh).toBe("cancelled");
    expect(result.current).toMatchObject({ cells: originalCells, loading: true, error: null });
    expect(onBackend).not.toHaveBeenCalled();
    expect(query).toHaveBeenLastCalledWith(latestViewport, 18, 168, expect.any(AbortSignal));

    await settle(() => afterViewport.resolve(refreshedCells));
    expect(result.current).toMatchObject({ cells: refreshedCells, loading: false, error: null });
    expect(onBackend.mock.calls).toEqual([["available"]]);
  });

  it.each<[ApiErrorKind, BackendStatus]>([
    ["network", "unavailable"],
    ["timeout", "unavailable"],
    ["http", "unknown"],
    ["format", "unknown"],
  ])("preserves previous cells and shows a %s refresh error", async (kind, backendStatus) => {
    query.mockResolvedValueOnce(originalCells);
    const onBackend = vi.fn();
    const { result } = renderHook(() => useHeatmapQuery(true, onBackend));
    await settle();
    const failure = new ApiError(kind, "热力图刷新失败，请重试。");
    query.mockRejectedValueOnce(failure);

    await act(async () => {
      expect(await result.current.refresh()).toBe("failed");
    });

    expect(result.current).toMatchObject({
      cells: originalCells,
      loading: false,
      error: failure.message,
    });
    expect(onBackend).toHaveBeenLastCalledWith(backendStatus);
  });

  it("ends loading without an error or backend failure for a cancelled request", async () => {
    query.mockResolvedValueOnce(originalCells);
    const onBackend = vi.fn();
    const { result } = renderHook(() => useHeatmapQuery(true, onBackend));
    await settle();
    onBackend.mockClear();
    query.mockRejectedValueOnce(new ApiError("cancelled", "请求已取消。"));

    await act(async () => {
      expect(await result.current.refresh()).toBe("cancelled");
    });

    expect(result.current).toMatchObject({ cells: originalCells, loading: false, error: null });
    expect(onBackend).not.toHaveBeenCalled();
  });

  it("clears disabled data and ignores a pending response after leaving the map", async () => {
    const pending = deferred<HeatmapCell[]>();
    query.mockResolvedValueOnce(originalCells).mockReturnValueOnce(pending.promise);
    const onBackend = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled }) => useHeatmapQuery(enabled, onBackend),
      { initialProps: { enabled: true } },
    );
    await settle();
    let refresh!: Promise<HeatmapRefreshResult>;
    act(() => { refresh = result.current.refresh(); });
    const signal = query.mock.calls[1][3]!;
    onBackend.mockClear();

    rerender({ enabled: false });
    expect(signal.aborted).toBe(true);
    await settle(() => pending.resolve(refreshedCells));

    expect(await refresh).toBe("cancelled");
    expect(result.current).toMatchObject({ cells: [], loading: false, error: null });
    expect(onBackend).not.toHaveBeenCalled();
  });

  it("aborts on unmount and ignores late results and the queued viewport timer", async () => {
    const pending = deferred<HeatmapCell[]>();
    query.mockReturnValueOnce(pending.promise);
    const onBackend = vi.fn();
    const { result, unmount } = renderHook(() => useHeatmapQuery(true, onBackend));
    const signal = query.mock.calls[0][3]!;
    act(() => result.current.updateViewport(latestViewport, 17));
    unmount();

    expect(signal.aborted).toBe(true);
    await settle(() => pending.resolve(refreshedCells));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });

    expect(query).toHaveBeenCalledTimes(1);
    expect(onBackend).not.toHaveBeenCalled();
    expect(result.current.cells).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
