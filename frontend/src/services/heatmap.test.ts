import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHeatmap, type HeatmapScope } from "./heatmap";

beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { headers: { "Content-Type": "application/json" } }))); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("heatmap request scope", () => {
  it("explicitly requests real feedback even if the server defaults to demo", async () => {
    await expect(fetchHeatmap("120.26,31.47,120.28,31.49")).resolves.toEqual([]);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]), "http://localhost");
    expect(url.pathname).toBe("/api/v1/heatmap");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      bbox: "120.26,31.47,120.28,31.49", zoom: "16", hours: "168", scope: "REAL_ONLY",
    });
  });

  it.each<HeatmapScope>(["REAL_ONLY", "SIMULATED_ONLY"])("forwards %s with the requested viewport, window and abort signal", async scope => {
    const controller = new AbortController();
    await fetchHeatmap("120.27,31.48,120.29,31.50", 18, 24, controller.signal, scope);
    const [address, options] = vi.mocked(fetch).mock.calls[0];
    const url = new URL(String(address), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      bbox: "120.27,31.48,120.29,31.50", zoom: "18", hours: "24", scope,
    });
    expect(options?.method ?? "GET").toBe("GET");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.body).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
