import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { WelcomePage } from "./WelcomePage";
import { CAMPUS_POINTS } from "../config/campus";

const defaultProps = {
  originPoint: null,
  destPoint: null,
  originName: "",
  destName: "",
  onOriginChange: vi.fn(),
  onDestChange: vi.fn(),
  onNavigateToPreview: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WelcomePage", () => {
  it("renders project title and subtitle", () => {
    render(<WelcomePage {...defaultProps} />);

    expect(
      screen.getByRole("heading", { name: "校园通勤情绪地图" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/江南大学蠡湖校区/)).toBeInTheDocument();
  });

  it("shows 5 campus points for both origin and destination selection", () => {
    render(<WelcomePage {...defaultProps} />);

    // Each point appears twice (once in origin grid, once in dest grid)
    for (const cp of CAMPUS_POINTS) {
      const buttons = screen.getAllByText(cp.name);
      expect(buttons.length).toBe(2);
    }
  });

  it("shows selector labels for origin and destination", () => {
    render(<WelcomePage {...defaultProps} />);

    expect(screen.getByText("选择起点")).toBeInTheDocument();
    expect(screen.getByText("选择终点")).toBeInTheDocument();
  });

  it("disables CTA when no points selected", () => {
    render(<WelcomePage {...defaultProps} />);

    const btn = screen.getByRole("button", { name: "查看推荐路线" });
    expect(btn).toBeDisabled();
  });

  it("enables CTA and shows selection summary when both points selected", () => {
    const origin = CAMPUS_POINTS[0].point;
    const dest = CAMPUS_POINTS[1].point;

    render(
      <WelcomePage
        {...defaultProps}
        originPoint={origin}
        destPoint={dest}
        originName="学生公寓区"
        destName="第一教学楼"
      />,
    );

    const btn = screen.getByRole("button", { name: "查看推荐路线" });
    expect(btn).not.toBeDisabled();

    expect(screen.getByText("学生公寓区")).toBeInTheDocument();
    expect(screen.getByText("第一教学楼")).toBeInTheDocument();
  });

  it("calls onNavigateToPreview when CTA is clicked", () => {
    const onNavigate = vi.fn();
    const origin = CAMPUS_POINTS[0].point;
    const dest = CAMPUS_POINTS[1].point;

    render(
      <WelcomePage
        {...defaultProps}
        originPoint={origin}
        destPoint={dest}
        originName="学生公寓区"
        destName="第一教学楼"
        onNavigateToPreview={onNavigate}
      />,
    );

    screen.getByRole("button", { name: "查看推荐路线" }).click();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("does not make any API calls on mount", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<WelcomePage {...defaultProps} />);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
