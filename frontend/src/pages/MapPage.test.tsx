import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapPage } from "./MapPage";
import type { MapPageState } from "../types";

const state: MapPageState = { heatmapCells: [], loading: true, error: null, routeComparison: null, trend: null };

describe("interactive map loading presentation", () => {
  it("uses the map slot's loading feedback while its controls remain actionable", () => {
    const close = vi.fn();
    render(<MapPage state={state} mapSlot={<section><p role="status">正在更新情绪热力图</p>
      <button onClick={close}>关闭热力点详情</button></section>} />);
    expect(screen.queryByText("正在加载热力图数据…")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在更新情绪热力图");
    fireEvent.click(screen.getByRole("button", { name: "关闭热力点详情" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("retains the initial loading state when no interactive map is supplied", () => {
    render(<MapPage state={state} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在加载热力图数据…");
  });
});
