import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    const rec = screen.getByRole("status");
    expect(rec).toHaveTextContent("建议尝试少心累路线");
  });

  it("shows submitting text when completing is true", () => {
    render(
      <TrendPanel
        trend={null}
        onCompleteCommute={() => {}}
        completing={true}
      />
    );
    expect(screen.getByText("提交中…")).toBeInTheDocument();
  });

  it("disables button when completing", () => {
    render(
      <TrendPanel
        trend={null}
        onCompleteCommute={() => {}}
        completing={true}
      />
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("disables button when disabled prop is true", () => {
    render(
      <TrendPanel
        trend={null}
        onCompleteCommute={() => {}}
        disabled={true}
      />
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("displays error message with alert role when error prop provided", () => {
    render(
      <TrendPanel
        trend={null}
        onCompleteCommute={() => {}}
        error="endStressLevel must be one of 0, 25, 50, 75, 100"
      />
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("endStressLevel must be one of 0, 25, 50, 75, 100");
  });
});
