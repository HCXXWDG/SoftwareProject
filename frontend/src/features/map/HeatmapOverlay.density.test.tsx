import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { HeatmapCell } from "../../types";
import { HeatmapOverlay } from "./HeatmapOverlay";

afterEach(cleanup);
const cells: HeatmapCell[] = ["a", "b", "c"].map((cellId, index) => ({
  cellId, center: { longitude: 120.3, latitude: 31.57 }, score: index * 25,
  count: index + 3, confidence: 1, dominantTag: "QUIET", feedbackSource: "REAL",
}));
const ids = () => screen.getAllByTestId("heatmap-point").map(node => node.dataset.cellId);

it("keeps all heat halos while separating touch targets and restores detail targets when zoomed in", () => {
  const dense = (cell: HeatmapCell) => ({ x: [50, 70, 105][cells.findIndex(item => item.cellId === cell.cellId)], y: 100 });
  const { rerender } = render(<HeatmapOverlay cells={cells} project={dense} viewportRevision={0} />);
  expect(screen.getAllByTestId("heatmap-point-halo")).toHaveLength(3);
  expect(ids()).toEqual(["a", "c"]);
  expect(screen.getByText("放大地图可查看更细的热力点")).toBeVisible();
  rerender(<HeatmapOverlay cells={[...cells].reverse()} project={dense} viewportRevision={1} />);
  expect(new Set(ids())).toEqual(new Set(["a", "c"]));
  rerender(<HeatmapOverlay cells={cells} project={cell => ({ x: 50 + cells.indexOf(cell) * 80, y: 100 })} viewportRevision={2} />);
  expect(ids()).toEqual(["a", "b", "c"]);
  expect(screen.queryByText("放大地图可查看更细的热力点")).not.toBeInTheDocument();
});

it("preserves the selected cell while zooming out without combining its metadata with neighboring cells", () => {
  const { rerender } = render(<HeatmapOverlay cells={cells}
    project={cell => ({ x: 50 + cells.indexOf(cell) * 80, y: 100 })} viewportRevision={0} />);
  fireEvent.click(screen.getAllByTestId("heatmap-point")[1]);
  rerender(<HeatmapOverlay cells={cells}
    project={cell => ({ x: 50 + cells.indexOf(cell) * 10, y: 100 })} viewportRevision={1} />);
  expect(ids()).toEqual(["b"]);
  const details = screen.getByRole("dialog", { name: "热力点详情" });
  expect(details).toHaveAttribute("data-cell-id", "b");
  expect(within(details).getByText("4 条反馈")).toBeVisible();
  expect(within(details).getByText("来源：真实反馈")).toBeVisible();
  expect(within(details).getByText("压力 25")).toBeVisible();
});

it("uses the same blue to red pressure colors for real and simulated sources", () => {
  const endpoints = [ { ...cells[0], score: 0 }, { ...cells[1], score: 100 } ];
  const project = (cell: HeatmapCell) => ({ x: cell.cellId === "a" ? 50 : 150, y: 100 });
  const { rerender } = render(<HeatmapOverlay cells={endpoints} project={project} viewportRevision={0} />);
  const colors = () => screen.getAllByTestId("heatmap-point").map(node => node.style.getPropertyValue("--heatmap-color"));
  expect(colors()).toEqual(["rgb(37, 99, 235)", "rgb(220, 38, 38)"]);
  rerender(<HeatmapOverlay cells={endpoints.map(cell => ({ ...cell, feedbackSource: "DEMO" }))} project={project} viewportRevision={1} />);
  expect(colors()).toEqual(["rgb(37, 99, 235)", "rgb(220, 38, 38)"]);
});
