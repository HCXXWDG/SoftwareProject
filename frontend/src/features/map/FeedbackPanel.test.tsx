import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedbackPanel } from "./FeedbackPanel";

describe("FeedbackPanel", () => {
  it("renders stress levels and emotion tags", () => {
    render(
      <FeedbackPanel
        position={{ x: 100, y: 200 }}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("这里感觉怎样？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /压力 50/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /原因 噪音/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交反馈" })).toBeDisabled();
  });

  it("enables submit only when both stress and tag are selected", () => {
    render(
      <FeedbackPanel
        position={{ x: 100, y: 200 }}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /压力 75/ }));
    // Still disabled — need tag
    expect(screen.getByRole("button", { name: "提交反馈" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /原因 拥挤/ }));
    // Now enabled
    expect(screen.getByRole("button", { name: "提交反馈" })).not.toBeDisabled();
  });

  it("calls onSubmit with selected values", () => {
    const onSubmit = vi.fn();
    render(
      <FeedbackPanel
        position={{ x: 100, y: 200 }}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /压力 100/ }));
    fireEvent.click(screen.getByRole("button", { name: /原因 暴晒/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    expect(onSubmit).toHaveBeenCalledWith(100, "SUN");
  });

  it("disables all controls when submitting", () => {
    render(
      <FeedbackPanel
        position={{ x: 100, y: 200 }}
        submitting={true}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /压力 0/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /原因 噪音/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "提交反馈" })).toBeDisabled();
    expect(screen.getByText("提交中…")).toBeInTheDocument();
  });

  it("calls onCancel when close button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <FeedbackPanel
        position={{ x: 100, y: 200 }}
        submitting={false}
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭反馈面板" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
