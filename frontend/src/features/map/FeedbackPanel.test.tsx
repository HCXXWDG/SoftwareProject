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

  it("shows error message when error prop is provided", () => {
    render(
      <FeedbackPanel
        position={{ x: 100, y: 200 }}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        error="网络错误，请稍后重试"
      />,
    );

    expect(screen.getByText("网络错误，请稍后重试")).toBeInTheDocument();
  });

  it("shows duplicate message when isDuplicate is true", () => {
    render(
      <FeedbackPanel
        position={{ x: 100, y: 200 }}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isDuplicate={true}
      />,
    );

    expect(
      screen.getByText("五分钟内已提交过附近路段，无需重复提交。"),
    ).toBeInTheDocument();
  });

  it("disables submit when submissionEnabled is false", () => {
    render(
      <FeedbackPanel
        position={{ x: 100, y: 200 }}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        submissionEnabled={false}
      />,
    );

    // Select stress and tag
    fireEvent.click(screen.getByRole("button", { name: /压力 50/ }));
    fireEvent.click(screen.getByRole("button", { name: /原因 噪音/ }));

    // Submit should still be disabled
    expect(screen.getByRole("button", { name: "提交反馈" })).toBeDisabled();
    expect(
      screen.getByText("反馈服务暂不可用，草稿已保留，请恢复连接后提交。"),
    ).toBeInTheDocument();
  });
});
