import { fireEvent, render, screen, within } from "@testing-library/react";
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
    const tags = [
      ["噪音", "🔊"], ["拥挤", "👥"], ["暴晒", "☀️"], ["异味", "👃"],
      ["安静", "🤫"], ["树荫", "🌳"], ["开阔", "🏞️"], ["其他", "💭"],
    ];
    expect(screen.getAllByRole("button", { name: /^原因 / })).toHaveLength(8);
    for (const [label, emoji] of tags) {
      expect(screen.getByRole("button", { name: `原因 ${label}` })).toHaveTextContent(emoji);
    }
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

  it("allows closing by button or Escape when not submitting", () => {
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
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["安静", "QUIET"], ["树荫", "SHADE"], ["开阔", "OPEN"],
  ])("submits the positive tag %s with a genuine zero stress level", (label, value) => {
    const onSubmit = vi.fn();
    render(
      <FeedbackPanel position={{ x: 100, y: 200 }} submitting={false}
        onCancel={vi.fn()} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "压力 0 轻松" }));
    fireEvent.click(screen.getByRole("button", { name: `原因 ${label}` }));
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(0, value);
  });

  it("keeps the selected draft after an inline error and retries the same values", () => {
    const props = {
      position: { x: 100, y: 200 }, onCancel: vi.fn(), onSubmit: vi.fn(),
    };
    const { rerender } = render(<FeedbackPanel {...props} submitting={false} />);
    fireEvent.click(screen.getByRole("button", { name: "压力 25 还好" }));
    fireEvent.click(screen.getByRole("button", { name: "原因 树荫" }));
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    rerender(<FeedbackPanel {...props} submitting />);
    rerender(<FeedbackPanel {...props} submitting={false} error="反馈请求超时，请重试。" />);

    const dialog = screen.getByRole("dialog", { name: "情绪反馈面板" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("反馈请求超时，请重试。");
    expect(screen.getByRole("button", { name: "压力 25 还好" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "原因 树荫" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    expect(props.onSubmit.mock.calls).toEqual([[25, "SHADE"], [25, "SHADE"]]);
  });

  it("preserves editable choices while submission is unavailable and enables the saved draft on recovery", () => {
    const props = {
      position: { x: 100, y: 200 }, submitting: false, onCancel: vi.fn(), onSubmit: vi.fn(),
    };
    const { rerender } = render(<FeedbackPanel {...props} submissionEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "压力 50 一般" }));
    fireEvent.click(screen.getByRole("button", { name: "原因 开阔" }));
    expect(screen.getByRole("status")).toHaveTextContent("草稿已保留");
    expect(screen.getByRole("button", { name: "提交反馈" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    expect(props.onSubmit).not.toHaveBeenCalled();

    rerender(<FeedbackPanel {...props} submissionEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).toHaveBeenCalledWith(50, "OPEN");
  });

  it("shows a duplicate receipt inside the panel and permits only closing", () => {
    const props = {
      position: { x: 100, y: 200 }, submitting: false, onCancel: vi.fn(), onSubmit: vi.fn(),
    };
    const { rerender } = render(<FeedbackPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "压力 75 烦躁" }));
    fireEvent.click(screen.getByRole("button", { name: "原因 拥挤" }));
    const submit = screen.getByRole("button", { name: "提交反馈" });
    submit.focus();
    fireEvent.click(submit);
    rerender(<FeedbackPanel {...props} isDuplicate />);

    const close = screen.getByRole("button", { name: "关闭反馈面板" });
    const panel = screen.getByRole("dialog", { name: "情绪反馈面板" });
    expect(within(panel).getByRole("status")).toHaveTextContent("已记录");
    expect(close).toHaveFocus();
    expect(close).not.toBeDisabled();
    expect(submit).toBeDisabled();
    expect(screen.getByRole("button", { name: "原因 安静" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "压力 0 轻松" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "原因 拥挤" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(submit);
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.click(close);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("recomputes the Tab boundaries when submit becomes enabled or disabled", () => {
    const props = {
      position: { x: 100, y: 200 }, submitting: false, onCancel: vi.fn(), onSubmit: vi.fn(),
    };
    const { rerender } = render(<FeedbackPanel {...props} />);
    const close = screen.getByRole("button", { name: "关闭反馈面板" });
    const lastTag = screen.getByRole("button", { name: "原因 其他" });
    const submit = screen.getByRole("button", { name: "提交反馈" });
    expect(close).toHaveFocus();
    lastTag.focus();
    expect(fireEvent.keyDown(lastTag, { key: "Tab" })).toBe(false);
    expect(close).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "压力 50 一般" }));
    fireEvent.click(lastTag);
    lastTag.focus();
    expect(fireEvent.keyDown(lastTag, { key: "Tab" })).toBe(true);
    submit.focus();
    fireEvent.keyDown(submit, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(submit).toHaveFocus();

    rerender(<FeedbackPanel {...props} submissionEnabled={false} />);
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(lastTag).toHaveFocus();
  });

  it("traps focus on the panel when submitting and blocks Escape and close until settled", () => {
    const props = {
      position: { x: 100, y: 200 }, onCancel: vi.fn(), onSubmit: vi.fn(),
    };
    const { rerender } = render(<FeedbackPanel {...props} submitting={false} />);
    // Native browsers can blur the focused close button when it becomes disabled.
    screen.getByRole("button", { name: "关闭反馈面板" }).blur();
    rerender(<FeedbackPanel {...props} submitting />);
    const panel = screen.getByRole("dialog", { name: "情绪反馈面板" });
    expect(panel).toHaveAttribute("aria-busy", "true");
    expect(panel).toHaveFocus();
    for (const shiftKey of [false, true]) {
      expect(fireEvent.keyDown(panel, { key: "Tab", shiftKey })).toBe(false);
      expect(panel).toHaveFocus();
    }
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "关闭反馈面板" }));
    expect(props.onCancel).not.toHaveBeenCalled();
    expect(props.onSubmit).not.toHaveBeenCalled();

    rerender(<FeedbackPanel {...props} submitting={false} />);
    expect(screen.getByRole("button", { name: "关闭反馈面板" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("restores the opener focus and removes keyboard handlers when unmounted", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onCancel = vi.fn();
    const { unmount } = render(
      <FeedbackPanel position={{ x: 100, y: 200 }} submitting={false}
        onCancel={onCancel} onSubmit={vi.fn()} />,
    );
    try {
      expect(screen.getByRole("button", { name: "关闭反馈面板" })).toHaveFocus();
      unmount();
      expect(opener).toHaveFocus();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onCancel).not.toHaveBeenCalled();
    } finally {
      opener.remove();
    }
  });
});
