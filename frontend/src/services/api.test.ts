import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("API request outcomes", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ ok: true }))));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps one persistent anonymous ID across GET and POST", async () => {
    const { api, getDeviceIdentityState } = await import("./api");
    await api.get("/first");
    await api.post("/second", { answer: 42 });
    const calls = vi.mocked(fetch).mock.calls;
    const first = (calls[0][1]?.headers as Record<string, string>)["X-Device-Id"];
    expect(first).toBeTruthy();
    expect((calls[1][1]?.headers as Record<string, string>)["X-Device-Id"]).toBe(first);
    expect(localStorage.getItem("commute-device-id")).toBe(first);
    expect(getDeviceIdentityState()).toEqual({ storageRestricted: false, message: null });
  });

  it.each(["getItem", "setItem"] as const)("uses a stable session ID if storage %s throws", async (method) => {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    const { api, getDeviceIdentityState } = await import("./api");
    await api.get("/first");
    await api.get("/second");
    const ids = vi.mocked(fetch).mock.calls.map((call) => (call[1]?.headers as Record<string, string>)["X-Device-Id"]);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
    expect(getDeviceIdentityState()).toMatchObject({ storageRestricted: true, message: expect.stringMatching(/刷新|关闭/) });
  });

  it("classifies a disconnected request and does not expose raw fetch errors", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("internal transport detail"));
    const { api, ApiError } = await import("./api");
    const error = await api.get("/test").catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "network", message: expect.stringContaining("无法连接") });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("classifies HTTP failures and hides proxy HTML", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("<html>secret gateway configuration</html>", { status: 502 }));
    const { api } = await import("./api");
    const error = await api.get("/test").catch((value: unknown) => value);
    expect(error).toMatchObject({ kind: "http", status: 502, message: "服务暂时不可用，请稍后重试。" });
    expect(String(error)).not.toContain("secret");
  });

  it("preserves structured business codes and safe Chinese messages", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 400, code: "invalid_request", message: "反馈位置超出校区。" }, 400));
    const { api } = await import("./api");
    await expect(api.post("/test", {})).rejects.toMatchObject({
      kind: "business", status: 400, code: "invalid_request", message: "反馈位置超出校区。",
    });
  });

  it("normalizes the backend's duplicate status as a business code", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: "duplicate", message: "五分钟内已提交过附近路段。" }, 409));
    const { api } = await import("./api");
    await expect(api.post("/test", {})).rejects.toMatchObject({ kind: "business", status: 409, code: "duplicate" });
  });

  it("rejects HTML within a JSON error message", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ code: "invalid_request", message: "错误 <script>secret</script>" }, 400));
    const { api } = await import("./api");
    await expect(api.post("/test", {})).rejects.toMatchObject({ message: "提交的信息有误，请检查后重试。" });
  });

  it.each(["html", "malformed", "shape"])("classifies a successful %s response as format failure", async (mode) => {
    vi.mocked(fetch).mockResolvedValue(mode === "html"
      ? new Response("<html>wrong server</html>", { headers: { "Content-Type": "text/html" } })
      : mode === "malformed"
        ? new Response("{broken", { headers: { "Content-Type": "application/json" } })
        : jsonResponse({ unexpected: true }));
    const { api } = await import("./api");
    await expect(api.get("/test", { validate: (value): value is { required: string } =>
      typeof value === "object" && value !== null && "required" in value })).rejects.toMatchObject({ kind: "format" });
  });

  it("supports JSON media type suffixes", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { headers: { "Content-Type": "application/problem+json; charset=utf-8" } }));
    const { api } = await import("./api");
    await expect(api.get("/test")).resolves.toEqual({ ok: true });
  });

  it.each(["GET", "POST"])("never automatically retries a failed %s", async (method) => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));
    const { api } = await import("./api");
    await expect(method === "POST" ? api.post("/test", {}) : api.get("/test")).rejects.toMatchObject({ kind: "network" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("applies the configured default deadline to a never-ending fetch", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_API_TIMEOUT_MS", "45");
    vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));
    const { api, DEFAULT_API_TIMEOUT_MS, isRequestCancelled } = await import("./api");
    expect(DEFAULT_API_TIMEOUT_MS).toBe(45);
    const result = api.get("/slow").catch((error: unknown) => error);
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await vi.advanceTimersByTimeAsync(45);
    const error = await result;
    expect(error).toMatchObject({ kind: "timeout" });
    expect(isRequestCancelled(error)).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applies a request deadline while reading a successful response body", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => new Promise(() => undefined) } as unknown as Response);
    const { api } = await import("./api");
    const result = api.get("/slow-body", { timeoutMs: 30 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30);
    expect(await result).toMatchObject({ kind: "timeout" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applies the same deadline to a stalled HTTP error body", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, json: () => new Promise(() => undefined) } as unknown as Response);
    const { api } = await import("./api");
    const result = api.get("/slow-error", { timeoutMs: 30 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30);
    expect(await result).toMatchObject({ kind: "timeout" });
  });

  it("cancels before fetching without creating a request", async () => {
    const controller = new AbortController();
    controller.abort();
    const { api, isRequestCancelled } = await import("./api");
    const error = await api.get("/test", controller.signal).catch((value: unknown) => value);
    expect(isRequestCancelled(error)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["fetch", "body"])("cancels a pending %s and removes listeners/timers", async (phase) => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(() => phase === "fetch"
      ? new Promise(() => undefined)
      : Promise.resolve({ ok: true, json: () => new Promise(() => undefined) } as unknown as Response));
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const { api, isRequestCancelled } = await import("./api");
    const existingTimers = vi.getTimerCount();
    const result = api.get("/test", controller.signal).catch((error: unknown) => error);
    await Promise.resolve();
    controller.abort();
    const error = await result;
    expect(isRequestCancelled(error)).toBe(true);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(existingTimers);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(error).toMatchObject({ kind: "cancelled" });
  });

  it("cleans up a successful request without aborting the caller's signal", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const { api } = await import("./api");
    const existingTimers = vi.getTimerCount();
    await expect(api.get("/test", controller.signal)).resolves.toEqual({ ok: true });
    expect(controller.signal.aborted).toBe(false);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(existingTimers);
  });
});
