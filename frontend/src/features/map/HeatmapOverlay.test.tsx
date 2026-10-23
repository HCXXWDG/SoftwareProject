import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmotionTag, FeedbackSource, HeatmapCell } from "../../types";
import { HeatmapOverlay } from "./HeatmapOverlay";

const cell: HeatmapCell = {
  cellId: "point-a", center: { longitude: 120.2739, latitude: 31.4793 },
  score: 0, confidence: 0.7, count: 3, dominantTag: "QUIET",
};
const project = () => ({ x: 100, y: 100 });

function open(value: HeatmapCell = cell) {
  render(<HeatmapOverlay cells={[value]} project={project} viewportRevision={0} />);
  const point = screen.getByRole("button", { name: `热力点 压力${Math.round(value.score)} ${value.dominantTag}` });
  fireEvent.click(point);
  return { point, details: screen.getByRole("dialog", { name: "热力点详情" }) };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("heatmap cell details", () => {
  it.each([
    ["NOISE", "噪音"], ["CROWD", "拥挤"], ["SUN", "暴晒"], ["ODOR", "异味"],
    ["QUIET", "安静"], ["SHADE", "树荫"], ["OPEN", "开阔"], ["OTHER", "其他"],
  ] as const)("shows the Chinese %s label while retaining the hotspot accessible name", (dominantTag, label) => {
    const { details } = open({ ...cell, dominantTag });
    expect(within(details).getByText(label, { exact: true })).toBeVisible();
    expect(within(details).getByText("压力 0")).toBeVisible();
    expect(within(details).getByText("3 条反馈")).toBeVisible();
  });

  it("renders an unknown legacy tag as other without widening the API contract", () => {
    // A defensive display case only; the HTTP response validator still rejects unknown tags.
    const { details } = open({ ...cell, dominantTag: "FUTURE_TAG" as EmotionTag });
    expect(within(details).getByText("其他", { exact: true })).toBeVisible();
    expect(details).not.toHaveTextContent("FUTURE_TAG");
  });

  it.each([
    ["REAL", "真实反馈"], ["DEMO", "演示反馈"], ["MIXED", "混合反馈"],
    ["NONE", "暂无反馈"], ["UNKNOWN", "未确认"],
  ] as const)("shows the declared %s provenance", (feedbackSource, label) => {
    const { details } = open({ ...cell, feedbackSource });
    expect(within(details).getByText(`来源：${label}`)).toBeVisible();
  });

  it.each([undefined, null, "FUTURE_SOURCE" as FeedbackSource])("does not invent real provenance for %s", feedbackSource => {
    const { details } = open({ ...cell, feedbackSource });
    expect(within(details).getByText("来源：未确认")).toBeVisible();
    expect(details).not.toHaveTextContent("真实反馈");
    expect(within(details).getByText("更新时间：未提供")).toBeVisible();
    expect(within(details).getByText("统计窗口：未提供")).toBeVisible();
  });

  it("shows the backend timestamp and aggregation window without inventing expiry", () => {
    const { details } = open({ ...cell, updatedAt: "2026-10-22T23:15:00Z", windowHours: 24 });
    expect(within(details).getByText(/更新时间：.*2026.*10.*23.*7:15:00.*北京时间/)).toBeVisible();
    expect(within(details).getByText("统计窗口：24 小时")).toBeVisible();
    expect(details).not.toHaveTextContent(/有效期|过期时间/);
  });

  it("closes by button or Escape and restores focus to the selected point", () => {
    const { point, details } = open();
    const close = within(details).getByRole("button", { name: "关闭热力点详情" });
    expect(close).toHaveFocus();
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(point).toHaveFocus();
    fireEvent.click(point);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(point).toHaveFocus();
  });

  it("forgets a removed selection instead of reopening stale details when the cell returns", () => {
    const { rerender } = render(<HeatmapOverlay cells={[cell]} project={project} viewportRevision={0} />);
    fireEvent.click(screen.getByTestId("heatmap-point"));
    expect(screen.getByRole("dialog")).toBeVisible();
    rerender(<HeatmapOverlay cells={[]} project={project} viewportRevision={1} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<HeatmapOverlay cells={[cell]} project={project} viewportRevision={2} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("allows Escape from the associated hotspot as well as the nonmodal details", () => {
    const { point } = open();
    point.focus();
    fireEvent.keyDown(point, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(point).toHaveFocus();
  });

  it("closes and disables background hotspots while feedback is open without restoring stale details", () => {
    const { rerender } = render(<HeatmapOverlay cells={[cell]} project={project} viewportRevision={0} />);
    const point = screen.getByTestId("heatmap-point");
    fireEvent.click(point);
    expect(screen.getByTestId("heatmap-overlay")).toHaveClass("map-surface__heatmap--details-open");
    rerender(<HeatmapOverlay cells={[cell]} project={project} viewportRevision={0} interactionEnabled={false} />);
    expect(point).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("heatmap-overlay")).not.toHaveClass("map-surface__heatmap--details-open");
    rerender(<HeatmapOverlay cells={[cell]} project={project} viewportRevision={0} />);
    expect(point).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([[4, 4], [316, 4], [4, 296], [316, 296]])("clamps measured details at map point %s,%s", (x, y) => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const isDetails = this.dataset.testid === "heatmap-cell-details";
      const width = isDetails ? 246 : 320;
      const height = isDetails ? 218 : 300;
      return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON() {} } as DOMRect;
    });
    render(<HeatmapOverlay cells={[cell]} project={() => ({ x, y })} viewportRevision={0} />);
    fireEvent.click(screen.getByTestId("heatmap-point"));
    const details = screen.getByRole("dialog");
    const left = Number.parseFloat(details.style.left);
    const top = Number.parseFloat(details.style.top);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(left + 246).toBeLessThanOrEqual(312);
    expect(top + 218).toBeLessThanOrEqual(292);
  });

  it("remeasures after text wrapping or container resizing changes the real dimensions", () => {
    let width = 390;
    let detailsWidth = 220;
    let detailsHeight = 140;
    const callbacks: (() => void)[] = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { callbacks.push(callback); }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const isDetails = this.dataset.testid === "heatmap-cell-details";
      const measuredWidth = isDetails ? detailsWidth : width;
      const height = isDetails ? detailsHeight : 400;
      return { x: 0, y: 0, left: 0, top: 0, right: measuredWidth, bottom: height,
        width: measuredWidth, height, toJSON() {} } as DOMRect;
    });
    open();
    width = 320;
    detailsWidth = 296;
    detailsHeight = 260;
    act(() => callbacks.forEach(callback => callback()));
    const details = screen.getByRole("dialog");
    expect(Number.parseFloat(details.style.left) + detailsWidth).toBeLessThanOrEqual(312);
    expect(Number.parseFloat(details.style.top) + detailsHeight).toBeLessThanOrEqual(392);
  });
});
