import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { WelcomePage } from "./WelcomePage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WelcomePage", () => {
  it("renders project title and subtitle", () => {
    const onNavigate = vi.fn();
    render(<WelcomePage onNavigateToPreview={onNavigate} />);

    expect(
      screen.getByRole("heading", { name: "校园通勤情绪地图" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/江南大学蠡湖校区/)).toBeInTheDocument();
  });

  it("shows fixed endpoint information", () => {
    render(<WelcomePage onNavigateToPreview={vi.fn()} />);

    expect(screen.getByText("起点")).toBeInTheDocument();
    expect(screen.getByText("终点")).toBeInTheDocument();
    expect(screen.getByText(/留学生公寓/)).toBeInTheDocument();
  });

  it("renders the CTA button", () => {
    const onNavigate = vi.fn();
    render(<WelcomePage onNavigateToPreview={onNavigate} />);

    const btn = screen.getByRole("button", { name: "查看预设路线" });
    expect(btn).toBeInTheDocument();

    btn.click();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("does not make any API calls on mount", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<WelcomePage onNavigateToPreview={vi.fn()} />);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
