import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommuteCompletionPanel } from "./CommuteCompletionPanel";
import { completeCommute } from "../../services/commute";
import { routeComparison } from "../../test/fixtures";
import type { RouteComparison } from "../../types";

vi.mock("../../services/commute", () => ({ completeCommute: vi.fn() }));
const comparison: RouteComparison = { ...routeComparison, routeSource: "REAL",
  snapshotId: "9f1c2a7e-6b0d-4c33-9a1e-2d5f7b8c1e40" };
const props = { comparison, selectedRouteId: "r1", backend: "available" as const,
  baseMap: "amap" as const, active: true, contextKey: "trip-1", onSaved: vi.fn(), onNewTrip: vi.fn() };

beforeEach(() => {
  sessionStorage.clear();
  vi.stubEnv("VITE_COMMUTE_RECORDING_ENABLED", "true");
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("CommuteCompletionPanel selection feedback", () => {
  it("confirms a pressure choice in text and waits for explicit completion before sending it", () => {
    render(<CommuteCompletionPanel {...props} />);
    const complete = screen.getByRole("button", { name: "完成本次通勤" });
    expect(complete).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "75 · 有些心累" }));
    expect(screen.getByRole("status")).toHaveTextContent("已选择：有些心累（75）");
    expect(screen.getByRole("button", { name: "75 · 有些心累" })).toHaveAttribute("aria-pressed", "true");
    expect(complete).toBeEnabled();
    expect(completeCommute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "25 · 比较轻松" }));
    expect(screen.getByRole("status")).toHaveTextContent("已选择：比较轻松（25）");
    expect(screen.getByRole("button", { name: "75 · 有些心累" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clears the previous trip's selection and its confirmation text on a new trip", () => {
    const { rerender } = render(<CommuteCompletionPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "0 · 非常轻松" }));
    expect(screen.getByRole("status")).toHaveTextContent("已选择：非常轻松（0）");
    rerender(<CommuteCompletionPanel {...props} contextKey="trip-2" />);
    expect(screen.getByRole("status")).toHaveTextContent("请选择到达时的压力感受。");
    expect(screen.getByRole("button", { name: "0 · 非常轻松" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "完成本次通勤" })).toBeDisabled();
  });
});
