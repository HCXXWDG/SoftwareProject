import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommuteCompleteRequest } from "../types";
import {
  clearPendingCommute, newPendingCommute, readPendingCommute, savePendingCommute,
  type PendingCommute,
} from "./pendingCommute";

const KEY = "commute-pending-v1";
const scope = "opaque-device-session|service-a";
const operationId = "9f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40";
const input = {
  snapshotId: "8f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40",
  routeId: "route-fast",
  endStressLevel: 25 as const,
};
const completedAt = "2026-10-22T04:00:00.000Z";

function create() { return newPendingCommute(input, scope); }
function stored() { return JSON.parse(sessionStorage.getItem(KEY)!); }

describe("pending commute persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(completedAt));
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue(operationId) });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("reports an empty slot without creating storage content", () => {
    expect(readPendingCommute()).toEqual({ status: "empty" });
    expect(sessionStorage.length).toBe(0);
  });

  it("creates one immutable whitelisted request with a fixed secure key and timestamp", () => {
    const pending = create();
    expect(pending).toEqual({ version: 1, scope, request: { ...input, operationId, completedAt } });
    expect(Object.isFrozen(pending)).toBe(true);
    expect(Object.isFrozen(pending.request)).toBe(true);
    expect(() => Object.assign(pending.request, { routeId: "changed" })).toThrow(TypeError);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
  });

  it("reuses the exact request after time changes, storage reload and repeated saves", () => {
    const pending = create();
    savePendingCommute(pending);
    vi.setSystemTime(new Date("2026-10-23T04:00:00Z"));
    const recovered = readPendingCommute();
    expect(recovered.status).toBe("pending");
    if (recovered.status !== "pending") throw new Error("expected pending");
    expect(recovered.pending.request).toEqual(pending.request);
    expect(Object.isFrozen(recovered.pending.request)).toBe(true);
    savePendingCommute(recovered.pending);
    expect(stored()).toEqual(pending);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("generates distinct keys and times only when explicitly creating another operation", () => {
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(operationId).mockReturnValueOnce("7f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40");
    const first = create();
    vi.setSystemTime(new Date("2026-10-22T05:00:00Z"));
    const second = create();
    expect(second.request.operationId).not.toBe(first.request.operationId);
    expect(first.request.completedAt).toBe(completedAt);
    expect(second.request.completedAt).toBe("2026-10-22T05:00:00.000Z");
  });

  it("ignores caller-supplied operation/time/score extras during creation", () => {
    const pending = newPendingCommute({ ...input, operationId: "forged", completedAt: "yesterday", selectedScore: 0 } as typeof input, scope);
    expect(pending.request).toEqual({ ...input, operationId, completedAt });
  });

  it("copies only whitelisted request and envelope fields without mutating the caller", () => {
    const request = { ...input, operationId, completedAt, selectedScore: 0, durationMinutes: 1, deviceId: "forged" };
    const pending = { version: 1, scope, request, serverUrl: "forged" } as PendingCommute;
    savePendingCommute(pending);
    expect(stored()).toEqual({ version: 1, scope, request: { ...input, operationId, completedAt } });
    expect(request).toHaveProperty("selectedScore", 0);
    expect(Object.isFrozen(request)).toBe(false);
  });

  it("does not invent an optional completedAt while saving or restoring an existing request", () => {
    const pending: PendingCommute = { version: 1, scope, request: { ...input, operationId } };
    savePendingCommute(pending);
    expect(stored()).toEqual(pending);
    expect(readPendingCommute()).toEqual({ status: "pending", pending });
    expect(stored().request).not.toHaveProperty("completedAt");
  });

  it("preserves original request values and scope without trimming or rewriting them", () => {
    const request: CommuteCompleteRequest = {
      ...input, snapshotId: input.snapshotId.toUpperCase(), operationId: " operation-original ",
      routeId: " route-original ", completedAt: "2026-10-22T12:00:00+08:00",
    };
    const pending: PendingCommute = { version: 1, scope: ` ${scope} `, request };
    savePendingCommute(pending);
    expect(readPendingCommute()).toEqual({ status: "pending", pending });
    expect(stored().request).toEqual(request);
  });

  it.each([
    { version: 0 }, { scope: "" }, { request: {} },
    { request: { ...input, operationId, snapshotId: "invalid" } },
    { request: { ...input, operationId, endStressLevel: 42 } },
    { request: { ...input, operationId, completedAt: "yesterday" } },
  ])("rejects an invalid pending envelope before persistence %#", (change) => {
    expect(() => savePendingCommute({ ...create(), ...change } as PendingCommute)).toThrow();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it.each([
    "not-json", "null", "[]", "{}", "",
    JSON.stringify({ version: 0, scope, request: { ...input, operationId } }),
    JSON.stringify({ version: 1, scope, request: { ...input, operationId, endStressLevel: 42 } }),
  ])("blocks corrupt or incompatible stored content without deleting or replacing it %#", (raw) => {
    sessionStorage.setItem(KEY, raw);
    expect(readPendingCommute()).toMatchObject({ status: "blocked", message: expect.any(String) });
    expect(() => savePendingCommute(create())).toThrow();
    expect(clearPendingCommute(operationId)).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBe(raw);
  });

  it("blocks when getItem is denied instead of treating storage as empty", () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    expect(readPendingCommute()).toMatchObject({ status: "blocked" });
    expect(() => savePendingCommute(create())).toThrow();
    expect(clearPendingCommute(operationId)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("blocks when sessionStorage itself is unavailable", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(readPendingCommute()).toMatchObject({ status: "blocked" });
    expect(() => savePendingCommute(create())).toThrow();
    expect(clearPendingCommute(operationId)).toBe(false);
  });

  it("throws when setItem is denied", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(() => savePendingCommute(create())).toThrow(/无法可靠保存/);
    expect(readPendingCommute()).toEqual({ status: "empty" });
  });

  it.each(["missing", "different", "unreadable"] as const)("throws when read-back is %s", (failure) => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockReturnValueOnce(null);
    if (failure === "unreadable") get.mockImplementationOnce(() => { throw new Error("blocked"); });
    else get.mockReturnValueOnce(failure === "missing" ? null : JSON.stringify({ version: 1, scope, request: { ...input, operationId: "other" } }));
    expect(() => savePendingCommute(create())).toThrow(/无法可靠保存/);
  });

  it.each([
    { operationId: "another-operation" },
    { snapshotId: "7f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40" },
    { routeId: "route-calm" }, { endStressLevel: 100 as const },
    { completedAt: "2026-10-22T05:00:00Z" },
  ])("cannot replace another operation or change the existing operation payload %#", (change) => {
    const original = create();
    savePendingCommute(original);
    expect(() => savePendingCommute({ ...original, request: { ...original.request, ...change } })).toThrow(/不能覆盖/);
    expect(stored()).toEqual(original);
  });

  it("does not discard a pending operation merely because its identity or service scope differs", () => {
    const original = create();
    savePendingCommute(original);
    expect(() => savePendingCommute({ ...original, scope: "other-device|other-service" })).toThrow(/不能覆盖/);
    expect(readPendingCommute()).toEqual({ status: "pending", pending: original });
  });

  it("clears only the matching operation and preserves unrelated storage", () => {
    savePendingCommute(create());
    sessionStorage.setItem("unrelated", "retained");
    expect(clearPendingCommute("other-operation")).toBe(false);
    expect(readPendingCommute().status).toBe("pending");
    expect(clearPendingCommute(operationId)).toBe(true);
    expect(readPendingCommute()).toEqual({ status: "empty" });
    expect(sessionStorage.getItem("unrelated")).toBe("retained");
    expect(clearPendingCommute(operationId)).toBe(false);
  });

  it("returns false and retains pending content if removeItem fails", () => {
    savePendingCommute(create());
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(clearPendingCommute(operationId)).toBe(false);
    expect(readPendingCommute().status).toBe("pending");
  });

  it("returns false when deletion cannot be verified", () => {
    savePendingCommute(create());
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {});
    expect(clearPendingCommute(operationId)).toBe(false);
    expect(readPendingCommute().status).toBe("pending");
  });

  it("uses getRandomValues to create a proper v4 UUID when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => { bytes.fill(0xab); return bytes; });
    vi.stubGlobal("crypto", { getRandomValues });
    const pending = create();
    expect(pending.request.operationId).toBe("abababab-abab-4bab-abab-abababababab");
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it("falls back to secure random bytes if randomUUID throws", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => { bytes.fill(0); return bytes; });
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => { throw new Error("unsupported context"); }), getRandomValues });
    expect(create().request.operationId).toBe("00000000-0000-4000-8000-000000000000");
  });

  it.each([undefined, {}, { getRandomValues: () => { throw new Error("blocked"); } }])("refuses creation without secure randomness %#", (secure) => {
    vi.stubGlobal("crypto", secure);
    const insecure = vi.spyOn(Math, "random");
    expect(() => create()).toThrow(/无法安全生成/);
    expect(insecure).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it("validates creation input instead of trusting a TypeScript cast", () => {
    expect(() => newPendingCommute({ ...input, endStressLevel: 42 } as unknown as typeof input, scope)).toThrow();
    expect(sessionStorage.length).toBe(0);
  });
});
