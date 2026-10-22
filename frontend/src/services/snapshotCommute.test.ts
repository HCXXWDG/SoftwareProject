import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommuteCompleteRequest } from "../types";
import { ApiError } from "./api";
import { completeCommute, CommuteCompletionConflictError } from "./commute";
import { isCommuteCompletion } from "./commuteCompletionValidators";

const input: CommuteCompleteRequest = {
  snapshotId: "9f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40",
  operationId: "operation-one-trip",
  routeId: "route-fast",
  endStressLevel: 25,
};
const saved = {
  ...input, status: "created", commuteId: "8f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40",
  routeLabel: "最快路线 A", routeSource: "UNKNOWN", estimatedSeconds: 1080, durationMinutes: 18,
  selectedScore: 62, completedAt: "2026-10-19T01:02:03Z", message: "通勤已记录。",
};

function response(value: unknown, status: number) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("D02 snapshot commute contract", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("posts only snapshot input, excluding client scores, labels and durations", async () => {
    vi.mocked(fetch).mockResolvedValue(response(saved, 201));
    const withUntrustedFields = {
      ...input, completedAt: "2026-10-19T01:02:03Z", selectedScore: 0, fastestScore: 0,
      routeLabel: "客户端伪造", durationMinutes: 1, estimatedSeconds: 1, confidence: 1,
    };
    await expect(completeCommute(withUntrustedFields)).resolves.toEqual(saved);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toMatch(/\/api\/v1\/commutes\/complete$/);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      ...input, completedAt: "2026-10-19T01:02:03Z",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns the complete existing record on 200 duplicate without another write", async () => {
    const duplicate = { ...saved, status: "duplicate", message: "该通勤已记录，返回既有结果，趋势不重复计数。" };
    vi.mocked(fetch).mockResolvedValue(response(duplicate, 200));
    await expect(completeCommute(input)).resolves.toEqual(duplicate);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["created", 200], ["created", 202], ["duplicate", 201],
  ])("rejects contradictory HTTP/body outcome %s with %s", async (status, httpStatus) => {
    vi.mocked(fetch).mockResolvedValue(response({ ...saved, status }, httpStatus as number));
    await expect(completeCommute(input)).rejects.toMatchObject({ kind: "format" });
  });

  it("supports a 45-second estimate and genuine zero scores without calling it actual duration", async () => {
    const shortTrip = { ...saved, endStressLevel: 0, selectedScore: 0, estimatedSeconds: 45, durationMinutes: 1 };
    vi.mocked(fetch).mockResolvedValue(response(shortTrip, 201));
    await expect(completeCommute({ ...input, endStressLevel: 0 })).resolves.toEqual(shortTrip);
  });

  it.each(["REAL", "DEMO", "UNKNOWN"].flatMap(routeSource =>
    ["created", "duplicate"].flatMap(status => ["missing", "null"].map(scoreShape => ({ routeSource, status, scoreShape }))),
  ))("accepts D07 $routeSource $status with a $scoreShape score without inventing zero", async ({ routeSource, status, scoreShape }) => {
    const { selectedScore: _score, ...withoutScore } = saved;
    const wire = { ...withoutScore, routeSource, status, ...(scoreShape === "null" ? { selectedScore: null } : {}) };
    vi.mocked(fetch).mockResolvedValue(response(wire, status === "created" ? 201 : 200));
    await expect(completeCommute(input)).resolves.toEqual({ ...wire, selectedScore: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { snapshotId: "7f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40" },
    { operationId: "another-operation" }, { routeId: "other-route" }, { endStressLevel: 100 },
  ])("rejects a result that belongs to different submitted content %#", async (change) => {
    vi.mocked(fetch).mockResolvedValue(response({ ...saved, ...change }, 201));
    await expect(completeCommute(input)).rejects.toMatchObject({ kind: "format" });
  });

  it.each([
    { snapshotId: "not-a-snapshot-uuid" }, { operationId: " " }, { operationId: "x".repeat(81) },
    { routeId: "" }, { endStressLevel: 42 }, { completedAt: "yesterday" },
  ])("rejects invalid submission before issuing a POST %#", async (change) => {
    await expect(completeCommute({ ...input, ...change } as CommuteCompleteRequest))
      .rejects.toMatchObject({ kind: "business", code: "invalid_request", status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { commuteId: "" }, { routeSource: "guessed" }, { routeSource: ["REAL"] }, { status: ["created"] }, { estimatedSeconds: 0 },
    { estimatedSeconds: 45, durationMinutes: 0.75 }, { estimatedSeconds: 45, durationMinutes: 2 },
    { selectedScore: -1 }, { selectedScore: 101 }, { selectedScore: NaN }, { selectedScore: Infinity }, { selectedScore: "0" },
    { completedAt: "yesterday" }, { message: "" },
  ])("does not trust malformed completion metadata %#", (change) => {
    expect(isCommuteCompletion({ ...saved, ...change }, 201)).toBe(false);
  });

  it("keeps a structured operation conflict and its existing record references", async () => {
    const conflict = {
      status: "conflict", operationId: input.operationId,
      existingCommuteId: saved.commuteId,
      existingSnapshotId: "7f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40",
      existingRouteId: "route-quiet", message: "相同操作 ID 已用于不同内容的通勤提交。",
    };
    vi.mocked(fetch).mockResolvedValue(response(conflict, 409));
    const error = await completeCommute(input).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(CommuteCompletionConflictError);
    expect(error).toMatchObject({ kind: "business", status: 409, code: "operation_conflict", conflict });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not attach another operation's conflict to this submission", async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      status: "conflict", operationId: "another-operation", message: "操作内容冲突。",
    }, 409));
    await expect(completeCommute(input)).rejects.toMatchObject({ kind: "format", status: 409 });
  });

  it.each([
    [404, "snapshot_not_found", "重新规划"],
    [410, "snapshot_expired", "已过期"],
    [422, "demo_result_not_allowed", "服务版本"],
    [400, "invalid_request", "信息有误"],
  ])("retains the structured %s/%s failure and gives an actionable message", async (status, code, message) => {
    vi.mocked(fetch).mockResolvedValue(response({ timestamp: "2026-10-19T01:02:03Z", status, code, message: "Server error" }, status as number));
    await expect(completeCommute(input)).rejects.toMatchObject({
      kind: "business", status, code, message: expect.stringContaining(message as string),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not reinterpret an unknown endpoint 404 as a missing snapshot", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ status: 404, message: "Not Found" }, 404));
    await expect(completeCommute(input)).rejects.toMatchObject({ kind: "http", status: 404, code: undefined });
  });

  it("never generates a new operation ID or retries a failed write automatically", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("connection dropped"))
      .mockResolvedValueOnce(response({ ...saved, status: "duplicate" }, 200));
    await expect(completeCommute(input)).rejects.toMatchObject({ kind: "network" });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(completeCommute(input)).resolves.toMatchObject({ status: "duplicate", commuteId: saved.commuteId });
    const bodies = vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([input, input]);
  });
});
