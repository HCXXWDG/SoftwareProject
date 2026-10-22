import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrendPanel } from "./TrendPanel";
import type { TrendResult } from "../../types";

const mockTrend: TrendResult = {
  points: [
    { date: "2025-06-10", averageStress: 42, commuteCount: 3 },
    { date: "2025-06-11", averageStress: 65, commuteCount: 2 },
  ],
  recommendation: "建议尝试少心累路线",
  totalCommutes: 5,
};

const noop = () => {};

function trendWith(points: TrendResult["points"]): TrendResult {
  return { points, recommendation: "", totalCommutes: points.reduce((sum, point) => sum + point.commuteCount, 0) };
}

function chart() {
  return screen.getByRole("img", { name: "七日通勤趋势折线图" });
}

function pointFor(date: string) {
  const point = [...chart().querySelectorAll("circle")]
    .find(circle => circle.querySelector("title")?.textContent?.startsWith(`${date}:`));
  expect(point).toBeDefined();
  return point!;
}

describe("TrendPanel", () => {
  it("renders empty state message when trend is null", () => {
    render(<TrendPanel trend={null} />);
    expect(screen.getByText("暂无通勤趋势数据")).toBeInTheDocument();
  });

  it("renders data view when points array is empty", () => {
    render(
      <TrendPanel trend={{ points: [], recommendation: "", totalCommutes: 0 }} />
    );
    expect(screen.getByText("共 0 次通勤")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("暂无可绘制的压力数据");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders table with trend data points", () => {
    render(<TrendPanel trend={mockTrend} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("2025-06-10")).toBeInTheDocument();
    expect(screen.getByText("2025-06-11")).toBeInTheDocument();
  });

  it("displays total commutes count in header", () => {
    render(<TrendPanel trend={mockTrend} />);
    expect(screen.getByText("共 5 次通勤")).toBeInTheDocument();
  });

  it("displays recommendation when present", () => {
    render(<TrendPanel trend={mockTrend} />);
    const statuses = screen.getAllByRole("status");
    expect(statuses.some((el) => el.textContent?.includes("建议尝试少心累路线"))).toBe(true);
  });

  it("shows submitting text when completing is true", () => {
    render(
      <TrendPanel
        trend={null}
        onCompleteCommute={noop}
        completing={true}
        userStressLevel={50}
        onStressLevelChange={noop}
      />
    );
    expect(screen.getByText("提交中…")).toBeInTheDocument();
  });

  it("disables complete button when completing", () => {
    render(
      <TrendPanel
        trend={null}
        onCompleteCommute={noop}
        completing={true}
        userStressLevel={50}
        onStressLevelChange={noop}
      />
    );
    const btn = screen.getByRole("button", { name: "提交中…" });
    expect(btn).toBeDisabled();
  });

  it("disables complete button when disabled prop is true", () => {
    render(
      <TrendPanel
        trend={null}
        onCompleteCommute={noop}
        disabled={true}
        userStressLevel={50}
        onStressLevelChange={noop}
      />
    );
    const btn = screen.getByRole("button", { name: "完成本次通勤" });
    expect(btn).toBeDisabled();
  });

  it("disables complete button when no stress level selected", () => {
    render(
      <TrendPanel
        trend={null}
        onCompleteCommute={noop}
        onStressLevelChange={noop}
        userStressLevel={null}
      />
    );
    const btn = screen.getByRole("button", { name: "完成本次通勤" });
    expect(btn).toBeDisabled();
  });

  it("displays error message with alert role when error prop provided", () => {
    render(
      <TrendPanel
        trend={null}
        onCompleteCommute={noop}
        error="endStressLevel must be one of 0, 25, 50, 75, 100"
      />
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("endStressLevel must be one of 0, 25, 50, 75, 100");
  });

  it("renders stress level selector when onStressLevelChange is provided", () => {
    render(
      <TrendPanel
        trend={null}
        onCompleteCommute={noop}
        onStressLevelChange={noop}
        userStressLevel={null}
      />
    );
    expect(screen.getByTestId("stress-level-selector")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "50" })).toBeInTheDocument();
  });

  it("calls onStressLevelChange when a stress button is clicked", () => {
    const onChange = vi.fn();
    render(
      <TrendPanel
        trend={null}
        onCompleteCommute={noop}
        onStressLevelChange={onChange}
        userStressLevel={null}
      />
    );
    screen.getByRole("button", { name: "75" }).click();
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it("shows trend refresh warning when provided", () => {
    render(
      <TrendPanel
        trend={mockTrend}
        trendRefreshWarning="通勤已记录，但趋势数据刷新失败"
      />
    );
    const warnings = screen.getAllByRole("status");
    expect(warnings.some((el) => el.textContent?.includes("趋势数据刷新失败"))).toBe(true);
  });

  it("plots adjacent days using the same values and dates as the table", () => {
    render(<TrendPanel trend={mockTrend} />);
    expect(chart().querySelectorAll("circle")).toHaveLength(2);
    expect(chart().querySelector("path")?.getAttribute("d")?.match(/[ML]/g)).toEqual(["M", "L"]);
    expect(Number(pointFor("2025-06-10").getAttribute("cx"))).toBe(30);
    expect(Number(pointFor("2025-06-10").getAttribute("cy"))).toBeCloseTo(62.2);
    expect(Number(pointFor("2025-06-11").getAttribute("cx"))).toBe(390);
    expect(Number(pointFor("2025-06-11").getAttribute("cy"))).toBeCloseTo(41.5);
    expect(within(screen.getByRole("table")).getByRole("row", { name: "2025-06-10 42 3" })).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByRole("row", { name: "2025-06-11 65 2" })).toBeInTheDocument();
  });

  it("keeps leading, middle and trailing null days on the date axis without plotting them as zero", () => {
    render(<TrendPanel trend={trendWith([
      { date: "2025-06-10", averageStress: null, commuteCount: 0 },
      { date: "2025-06-11", averageStress: 0, commuteCount: 1 },
      { date: "2025-06-12", averageStress: null, commuteCount: 0 },
      { date: "2025-06-13", averageStress: 100, commuteCount: 1 },
      { date: "2025-06-14", averageStress: null, commuteCount: 0 },
    ])} />);
    expect(chart().querySelectorAll("circle")).toHaveLength(2);
    expect(chart().querySelector("path")?.getAttribute("d")).toBe("M 120 100 M 300 10");
    expect(pointFor("2025-06-11")).toHaveAttribute("cy", "100");
    expect(within(chart()).getByText("06-10")).toHaveAttribute("x", "30");
    expect(within(chart()).getByText("06-12")).toHaveAttribute("x", "210");
    expect(within(chart()).getByText("06-14")).toHaveAttribute("x", "390");
    expect(within(screen.getByRole("table")).getAllByText("—")).toHaveLength(3);
    expect(within(screen.getByRole("table")).getByRole("row", { name: "2025-06-11 0 1" })).toBeInTheDocument();
  });

  it("draws separate adjacent-day segments on either side of a null day", () => {
    render(<TrendPanel trend={trendWith([
      { date: "2025-06-10", averageStress: 10, commuteCount: 1 },
      { date: "2025-06-11", averageStress: 20, commuteCount: 1 },
      { date: "2025-06-12", averageStress: null, commuteCount: 0 },
      { date: "2025-06-13", averageStress: 40, commuteCount: 1 },
      { date: "2025-06-14", averageStress: 50, commuteCount: 1 },
    ])} />);
    expect(chart().querySelectorAll("circle")).toHaveLength(4);
    expect(chart().querySelector("path")?.getAttribute("d")?.match(/[ML]/g)).toEqual(["M", "L", "M", "L"]);
  });

  it("preserves elapsed calendar spacing and breaks a gap even if the response omits the missing date", () => {
    render(<TrendPanel trend={trendWith([
      { date: "2025-06-10", averageStress: 0, commuteCount: 1 },
      { date: "2025-06-12", averageStress: 50, commuteCount: 1 },
      { date: "2025-06-13", averageStress: 100, commuteCount: 1 },
    ])} />);
    expect(chart().querySelector("path")?.getAttribute("d")).toBe("M 30 100 M 270 55 L 390 10");
    expect(pointFor("2025-06-12")).toHaveAttribute("cx", "270");
  });

  it("centers a single observation without inventing a line or another date", () => {
    render(<TrendPanel trend={trendWith([{ date: "2025-06-10", averageStress: 50, commuteCount: 1 }])} />);
    expect(chart().querySelectorAll("circle")).toHaveLength(1);
    expect(chart().querySelector("path")?.getAttribute("d")).toBe("M 210 55");
    expect(within(chart()).getAllByText("06-10")).toHaveLength(1);
    expect(within(screen.getByRole("table")).getByRole("row", { name: "2025-06-10 50 1" })).toBeInTheDocument();
  });

  it("shows an all-null explanation and retains the empty-date table without a fictitious chart", () => {
    render(<TrendPanel trend={trendWith([
      { date: "2025-06-10", averageStress: null, commuteCount: 0 },
      { date: "2025-06-11", averageStress: null, commuteCount: 0 },
    ])} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("暂无可绘制的压力数据");
    expect(within(screen.getByRole("table")).getAllByText("—")).toHaveLength(2);
  });

  it("plots actual zero stress as observations and a zero-level line", () => {
    render(<TrendPanel trend={trendWith([
      { date: "2025-06-10", averageStress: 0, commuteCount: 1 },
      { date: "2025-06-11", averageStress: 0, commuteCount: 1 },
    ])} />);
    expect(chart().querySelectorAll("circle")).toHaveLength(2);
    expect(chart().querySelector("path")?.getAttribute("d")).toBe("M 30 100 L 390 100");
    expect(screen.queryByText("暂无可绘制的压力数据")).not.toBeInTheDocument();
  });

  it("orders the plotted dates without mutating the server response", () => {
    const points = [
      { date: "2025-06-12", averageStress: 75, commuteCount: 1 },
      { date: "2025-06-10", averageStress: 25, commuteCount: 1 },
    ];
    render(<TrendPanel trend={trendWith(points)} />);
    expect(points.map(point => point.date)).toEqual(["2025-06-12", "2025-06-10"]);
    const titles = [...chart().querySelectorAll("circle title")].map(title => title.textContent);
    expect(titles).toEqual(["2025-06-10: 平均压力 25, 1 次通勤", "2025-06-12: 平均压力 75, 1 次通勤"]);
    expect(chart().querySelector("path")?.getAttribute("d")?.match(/[ML]/g)).toEqual(["M", "M"]);
  });

  it("adds no refresh or write controls when A supplies only the trend data", () => {
    render(<TrendPanel trend={mockTrend} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stress-level-selector")).not.toBeInTheDocument();
  });

  it.each([mockTrend, null])("supports an explicit refresh callback with or without data: %s", (trend) => {
    const onRefresh = vi.fn();
    render(<TrendPanel trend={trend} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "刷新趋势数据" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "完成本次通勤" })).not.toBeInTheDocument();
  });

  it("disables an optional refresh control while retaining the previous chart during refresh", () => {
    const onRefresh = vi.fn();
    render(<TrendPanel trend={mockTrend} onRefresh={onRefresh} loading />);
    const button = screen.getByRole("button", { name: "刷新趋势数据" });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("刷新中…");
    fireEvent.click(button);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(chart().querySelectorAll("circle")).toHaveLength(2);
  });
});
