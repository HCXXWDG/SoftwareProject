import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { fetchRouteHistory } from "./history";

vi.mock("./api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./api")>(),
  api: { get: vi.fn() },
}));

const entry = {
  id: "query-1",
  origin: { longitude: 120.27351, latitude: 31.475328 },
  destination: { longitude: 120.274319, latitude: 31.483275 },
  createdAt: "2026-10-18T02:00:00Z",
  result: { routes: [{ stressScore: 100 }] },
};

afterEach(() => vi.clearAllMocks());

describe("fetchRouteHistory", () => {
  it("forwards cancellation and restores endpoints without returning historical scores", async () => {
    const controller = new AbortController();
    vi.mocked(api.get).mockResolvedValueOnce([entry]);
    const result = await fetchRouteHistory(10, controller.signal);
    expect(api.get).toHaveBeenCalledWith("/api/v1/routes/history?limit=10", controller.signal);
    expect(result).toEqual([{ id: entry.id, origin: entry.origin, destination: entry.destination, createdAt: entry.createdAt }]);
    expect(result[0]).not.toHaveProperty("result");
    expect(result[0].origin).not.toBe(entry.origin);
  });

  it("accepts an empty history as a successful response", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([]);
    await expect(fetchRouteHistory()).resolves.toEqual([]);
  });

  it.each([
    {},
    [null],
    [{ ...entry, id: "" }],
    [{ ...entry, origin: { longitude: 181, latitude: 31 } }],
    [{ ...entry, destination: { longitude: 120, latitude: Number.NaN } }],
    [{ ...entry, createdAt: "unknown" }],
  ])("rejects malformed endpoint metadata %#", async (response) => {
    vi.mocked(api.get).mockResolvedValueOnce(response);
    await expect(fetchRouteHistory()).rejects.toMatchObject({ kind: "format", message: "服务器返回的查询历史格式不正确" });
  });

  it.each([0, 51, 1.5, Number.NaN])("does not send invalid limits %s", async (limit) => {
    await expect(fetchRouteHistory(limit)).rejects.toThrow("1 到 50");
    expect(api.get).not.toHaveBeenCalled();
  });
});
