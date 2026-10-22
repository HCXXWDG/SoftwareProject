import { StrictMode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../services/api";
import { completeCommute } from "../services/commute";
import { newPendingCommute, readPendingCommute, savePendingCommute } from "../services/pendingCommute";
import { deferred } from "../test/fixtures";
import type { CommuteCompleteRequest, CommuteCompletion } from "../types";
import { useCommuteOperation } from "./useCommuteOperation";

let scope = "session-a:service-a";
vi.mock("../services/api", async () => ({
  ...await vi.importActual<typeof import("../services/api")>("../services/api"),
  getApiRequestScope: () => scope,
}));
vi.mock("../services/commute", () => ({ completeCommute: vi.fn() }));
const post = vi.mocked(completeCommute);
const draft = { snapshotId: "9f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40", routeId: "route-fast", endStressLevel: 25 as const };
function receipt(input: CommuteCompleteRequest, status: "created" | "duplicate" = "created"): CommuteCompletion {
  return { ...input, status, commuteId: "8f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40", routeLabel: "路线A",
    routeSource: "REAL", estimatedSeconds: 45, durationMinutes: 1, selectedScore: 0,
    completedAt: input.completedAt!, message: "通勤已记录。" };
}
async function begin(result: { current: ReturnType<typeof useCommuteOperation> }) {
  await act(async () => { await result.current.begin(draft); });
}
beforeEach(() => {
  sessionStorage.clear(); scope = "session-a:service-a";
  post.mockReset().mockImplementation(async input => receipt(input));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("explicit commute operation recovery (controlled service)", () => {
  it("defaults to no writes and requires an accepted backend gate", async () => {
    const { result } = renderHook(() => useCommuteOperation());
    await begin(result);
    expect(post).not.toHaveBeenCalled();
    expect(readPendingCommute().status).toBe("empty");
    expect(result.current.error).toContain("联合验收");
  });

  it("keeps restored operations pending when the backend gate is disabled", async () => {
    const pending = newPendingCommute(draft, scope); savePendingCommute(pending);
    const { result } = renderHook(() => useCommuteOperation());
    await act(async () => { await result.current.retry(); });
    expect(post).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("pending");
    expect(result.current.error).toContain("联合验收");
    expect(readPendingCommute()).toMatchObject({ status: "pending", pending });
  });

  it("persists the exact frozen whitelist before POST and confirms a short zero-score receipt", async () => {
    post.mockImplementation(async input => {
      expect(readPendingCommute()).toMatchObject({ status: "pending", pending: { scope, request: input } });
      expect(Object.isFrozen(input)).toBe(true);
      expect(Object.keys(input).sort()).toEqual(["snapshotId", "routeId", "endStressLevel", "operationId", "completedAt"].sort());
      return receipt(input);
    });
    const { result } = renderHook(() => useCommuteOperation({ enabled: true }));
    await act(async () => { await result.current.begin({ ...draft, selectedScore: 100 } as typeof draft); });
    expect(result.current).toMatchObject({ phase: "saved", receipt: { selectedScore: 0, estimatedSeconds: 45 }, error: null });
    expect(readPendingCommute().status).toBe("empty");
  });

  it("locks synchronously against double clicks and does not mutate an in-flight request", async () => {
    const pending = deferred<CommuteCompletion>(); post.mockReturnValue(pending.promise);
    const input = { ...draft };
    const { result } = renderHook(() => useCommuteOperation({ enabled: true }));
    let first!: Promise<CommuteCompletion | null>;
    act(() => { first = result.current.begin(input); void result.current.begin({ ...draft, routeId: "other" }); });
    input.routeId = "changed-later";
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0].routeId).toBe("route-fast");
    await act(async () => { pending.resolve(receipt(post.mock.calls[0][0])); await first; });
  });

  it.each([
    new ApiError("network", "断网"), new ApiError("timeout", "超时"), new ApiError("format", "回执无效"),
    new ApiError("cancelled", "取消"), new ApiError("business", "冲突", { status: 409, code: "operation_conflict" }),
    new ApiError("business", "缺失", { status: 404, code: "snapshot_not_found" }),
    new ApiError("business", "过期", { status: 410, code: "snapshot_expired" }),
  ])("retains the original operation after %s and never replaces it with startNew/begin", async failure => {
    post.mockRejectedValueOnce(failure);
    const { result } = renderHook(() => useCommuteOperation({ enabled: true }));
    await begin(result);
    const original = post.mock.calls[0][0];
    expect(result.current.phase).toBe("pending");
    if (failure.status === 404 || failure.status === 410) expect(result.current.error).toContain("不能据此判断");
    act(() => { expect(result.current.startNew()).toBe(false); });
    await act(async () => { await result.current.begin({ ...draft, endStressLevel: 100 }); });
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.retry(); });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0]).toEqual(original);
  });

  it("restores after reload without automatically writing, then retries the identical key and time", async () => {
    post.mockRejectedValueOnce(new ApiError("network", "回执丢失"));
    const first = renderHook(() => useCommuteOperation({ enabled: true }));
    await begin(first.result); const original = post.mock.calls[0][0]; first.unmount();
    const recovered = renderHook(() => useCommuteOperation({ enabled: true }));
    expect(recovered.result.current.phase).toBe("pending");
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => { await recovered.result.current.retry(); });
    expect(post.mock.calls[1][0]).toEqual(original);
  });

  it("does not send or replace a restored request when the device/service scope changes", async () => {
    const pending = newPendingCommute(draft, scope); savePendingCommute(pending);
    const { result } = renderHook(() => useCommuteOperation({ enabled: true }));
    scope = "session-b:service-b";
    await act(async () => { await result.current.retry(); });
    expect(result.current.phase).toBe("blocked");
    expect(result.current.error).toContain("会话或服务地址");
    expect(readPendingCommute()).toMatchObject({ status: "pending", pending });
    expect(post).not.toHaveBeenCalled();
  });

  it("blocks POST when persistence fails and reuses the in-memory operation after storage recovers", async () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    const { result } = renderHook(() => useCommuteOperation({ enabled: true }));
    await begin(result); const original = result.current.operation!.request;
    expect(result.current.phase).toBe("blocked"); expect(post).not.toHaveBeenCalled();
    write.mockRestore();
    await act(async () => { await result.current.retry(); });
    expect(post.mock.calls[0][0]).toEqual(original);
  });

  it("does not treat corrupted prior state as permission to create another write", async () => {
    sessionStorage.setItem("commute-pending-v1", "{invalid");
    const { result } = renderHook(() => useCommuteOperation({ enabled: true }));
    await begin(result); await act(async () => { await result.current.retry(); });
    expect(result.current.phase).toBe("blocked"); expect(post).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("commute-pending-v1")).toBe("{invalid");
  });

  it("records success before a failed refresh and never repeats POST for that failure", async () => {
    const onSaved = vi.fn().mockRejectedValue(new Error("query failed"));
    const { result } = renderHook(() => useCommuteOperation({ enabled: true, onSaved }));
    await begin(result);
    expect(result.current).toMatchObject({ phase: "saved", error: null, refreshWarning: expect.stringContaining("只刷新查询") });
    await act(async () => { await result.current.retry(); await result.current.begin(draft); });
    expect(post).toHaveBeenCalledTimes(1); expect(onSaved).toHaveBeenCalledTimes(1);
    act(() => { expect(result.current.startNew()).toBe(true); });
    await begin(result);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0].operationId).not.toBe(post.mock.calls[0][0].operationId);
  });

  it("retries only queries after confirmed success and clears the refresh warning", async () => {
    const onSaved = vi.fn().mockRejectedValueOnce(new Error("query failed")).mockResolvedValue(undefined);
    const { result } = renderHook(() => useCommuteOperation({ enabled: true, onSaved }));
    await begin(result);
    expect(result.current.refreshWarning).toContain("只刷新查询");
    await act(async () => { expect(await result.current.refresh()).toBe(true); });
    expect(onSaved).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.refreshWarning).toBeNull();
    expect(result.current.phase).toBe("saved");
  });

  it("does not attach a late query-refresh failure to another journey", async () => {
    const query = deferred<void>();
    const onSaved = vi.fn().mockReturnValue(query.promise);
    const { result, rerender } = renderHook(({ contextKey }) => useCommuteOperation({ enabled: true, contextKey, onSaved }),
      { initialProps: { contextKey: "trip-a" } });
    let attempt!: Promise<CommuteCompletion | null>;
    act(() => { attempt = result.current.begin(draft); });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    rerender({ contextKey: "trip-b" });
    await act(async () => { query.reject(new Error("old refresh")); await attempt; });
    expect(result.current.refreshWarning).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each(["journey", "scope"] as const)("does not refresh after an old response crosses a %s change", async changed => {
    const pending = deferred<CommuteCompletion>(); post.mockReturnValue(pending.promise); const onSaved = vi.fn();
    const { result, rerender } = renderHook(({ contextKey }) => useCommuteOperation({ enabled: true, contextKey, onSaved }), { initialProps: { contextKey: "trip-a" } });
    let attempt!: Promise<CommuteCompletion | null>;
    act(() => { attempt = result.current.begin(draft); });
    if (changed === "journey") rerender({ contextKey: "trip-b" });
    else scope = "new-device-or-server";
    await act(async () => { pending.resolve(receipt(post.mock.calls[0][0])); await attempt; });
    expect(result.current.phase).toBe(changed === "scope" ? "blocked" : "saved");
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.receipt?.snapshotId).toBe(draft.snapshotId);
  });

  it("does not clear later pending content, even when it reuses an operation ID with another scope", async () => {
    const pending = deferred<CommuteCompletion>(); post.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useCommuteOperation({ enabled: true }));
    let attempt!: Promise<CommuteCompletion | null>;
    act(() => { attempt = result.current.begin(draft); });
    const original = result.current.operation!;
    sessionStorage.clear();
    const other = { ...original, scope: "different-service", request: { ...original.request, routeId: "different-route" } };
    savePendingCommute(other);
    await act(async () => { pending.resolve(receipt(post.mock.calls[0][0])); await attempt; });
    expect(readPendingCommute()).toMatchObject({ status: "pending", pending: other });
    expect(result.current.storageWarning).toBeTruthy();
    act(() => { expect(result.current.startNew()).toBe(false); });
    expect(readPendingCommute()).toMatchObject({ status: "pending", pending: other });
  });

  it("keeps a confirmed receipt if cleanup fails and cleans only before an explicit next trip", async () => {
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useCommuteOperation({ enabled: true }));
    await begin(result);
    expect(result.current.phase).toBe("saved"); expect(result.current.storageWarning).toBeTruthy();
    await act(async () => { await result.current.retry(); });
    expect(post).toHaveBeenCalledTimes(1);
    act(() => { expect(result.current.startNew()).toBe(false); });
    remove.mockRestore();
    act(() => { expect(result.current.startNew()).toBe(true); });
    expect(readPendingCommute().status).toBe("empty");
  });

  it("does not call refresh after unmount and StrictMode recovery never writes on mount", async () => {
    const pending = deferred<CommuteCompletion>(); post.mockReturnValue(pending.promise); const onSaved = vi.fn();
    const first = renderHook(() => useCommuteOperation({ enabled: true, onSaved }));
    let attempt!: Promise<CommuteCompletion | null>;
    act(() => { attempt = first.result.current.begin(draft); });
    first.unmount();
    const recovered = renderHook(() => useCommuteOperation({ enabled: true }), { wrapper: StrictMode });
    expect(recovered.result.current.phase).toBe("pending"); expect(post).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(receipt(post.mock.calls[0][0])); await attempt; });
    expect(onSaved).not.toHaveBeenCalled();
  });
});
