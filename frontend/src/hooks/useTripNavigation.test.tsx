import { StrictMode, type PropsWithChildren } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DESTINATION, DEFAULT_ORIGIN } from "../config/campus";
import { useTripNavigation, type TripSelection } from "./useTripNavigation";

const KEY = "commute-trip-v1";
const selection: TripSelection = {
  origin: { longitude: 120.273019, latitude: 31.482245 },
  destination: { longitude: 120.275344, latitude: 31.487085 },
  originName: "图书馆",
  destName: "体育中心",
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useTripNavigation", () => {
  it("starts at the welcome stage with the configured endpoints", () => {
    const { result } = renderHook(() => useTripNavigation());
    expect(result.current.stage).toBe("welcome");
    expect(result.current.selection).toEqual({
      origin: DEFAULT_ORIGIN.point,
      destination: DEFAULT_DESTINATION.point,
      originName: DEFAULT_ORIGIN.name,
      destName: DEFAULT_DESTINATION.name,
    });
    expect(window.location.hash).toBe("#welcome");
  });

  it.each([
    "{broken-json",
    JSON.stringify({ version: 2, stage: "map", selection }),
    JSON.stringify({ version: 0, stage: "route-preview", selection }),
    JSON.stringify({ version: 1, stage: "unknown-page", selection }),
    JSON.stringify({ version: 1, stage: "map", selection: { ...selection, origin: { longitude: 181, latitude: 31 } } }),
    JSON.stringify({ version: 1, stage: "map", selection: { ...selection, originName: "" } }),
    JSON.stringify({ version: 1, stage: "map", selection: { ...selection, destName: "  " } }),
  ])("returns to safe defaults for unsupported saved state %#", (savedState) => {
    localStorage.setItem(KEY, savedState);
    const { result } = renderHook(() => useTripNavigation());
    expect(result.current.stage).toBe("welcome");
    expect(result.current.selection.origin).toEqual(DEFAULT_ORIGIN.point);
    expect(result.current.selection.destination).toEqual(DEFAULT_DESTINATION.point);
  });

  it("persists only versioned endpoints and stage, excluding comparison and score fields", () => {
    const { result } = renderHook(() => useTripNavigation());
    const withObsoleteFields = {
      ...selection,
      origin: { ...selection.origin, selectedScore: 88 },
      routeComparison: { routes: [{ stressScore: 88 }], comparisonId: "old-comparison" },
      selectedRouteId: "old-route",
    };
    act(() => result.current.navigate("map", withObsoleteFields));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ version: 1, stage: "map", selection });
    expect(window.history.state.commuteTrip).toEqual({ version: 1, stage: "map", selection });
  });

  it("restores a saved map trip to preview so its routes must be queried again", () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 1,
      stage: "map",
      selection,
      routeComparison: { comparisonId: "expired", routes: [{ stressScore: 77 }] },
      selectedRouteId: "expired-route",
    }));
    const { result } = renderHook(() => useTripNavigation());
    expect(result.current.stage).toBe("route-preview");
    expect(result.current.selection).toEqual(selection);
    expect(result.current).not.toHaveProperty("routeComparison");
    expect(result.current).not.toHaveProperty("selectedRouteId");
    expect(window.location.hash).toBe("#route-preview");
  });

  it("strips obsolete comparison data from restored endpoint preferences", () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 1,
      stage: "map",
      selection: { ...selection, routeComparison: { stressScore: 77 }, selectedScore: 77 },
    }));
    const { result } = renderHook(() => useTripNavigation());
    expect(result.current.selection).toEqual(selection);
    expect(window.history.state.commuteTrip.selection).toEqual(selection);
  });

  it("restores the matching browser-history endpoints and enters a safe preview", () => {
    const { result } = renderHook(() => useTripNavigation());
    const currentSelection = { ...selection, originName: "另一处起点" };
    act(() => result.current.navigate("map", currentSelection));
    act(() => window.dispatchEvent(new PopStateEvent("popstate", {
      state: { commuteTrip: { version: 1, stage: "map", selection } },
    })));
    expect(result.current.stage).toBe("route-preview");
    expect(result.current.selection).toEqual(selection);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ version: 1, stage: "route-preview", selection });
    expect(window.location.hash).toBe("#route-preview");
  });

  it("falls back to welcome for unrecognized browser history without keeping a map stage", () => {
    const { result } = renderHook(() => useTripNavigation());
    act(() => result.current.navigate("map", selection));
    act(() => window.dispatchEvent(new PopStateEvent("popstate", {
      state: { commuteTrip: { version: 9, stage: "map", selection } },
    })));
    expect(result.current.stage).toBe("welcome");
    expect(result.current.selection).toEqual(selection);
  });

  it("pushes one browser history entry for one user navigation in StrictMode", () => {
    function Wrapper({ children }: PropsWithChildren) { return <StrictMode>{children}</StrictMode>; }
    const { result } = renderHook(() => useTripNavigation(), { wrapper: Wrapper });
    const push = vi.spyOn(window.history, "pushState");
    act(() => result.current.navigate("route-preview", selection));
    expect(push).toHaveBeenCalledTimes(1);
    expect(result.current.stage).toBe("route-preview");
    expect(result.current.selection).toEqual(selection);
  });

  it("continues navigation when browser storage cannot be read or written", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Storage denied", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Storage denied", "SecurityError"); });
    const { result } = renderHook(() => useTripNavigation());
    expect(result.current.stage).toBe("welcome");
    act(() => result.current.navigate("route-preview", selection));
    expect(result.current.stage).toBe("route-preview");
    expect(result.current.selection).toEqual(selection);
    expect(window.location.hash).toBe("#route-preview");
    act(() => result.current.navigate("map"));
    expect(result.current.stage).toBe("map");
    expect(result.current.selection).toEqual(selection);
  });
});
