import { render, screen } from "@testing-library/react";
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
});
