import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLongPress } from "./useLongPress";

afterEach(() => {
  vi.useRealTimers();
});

describe("useLongPress", () => {
  it("fires callback after 600ms hold without movement", async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.handlePointerDown({
        pointerId: 1,
        clientX: 200,
        clientY: 300,
      } as React.PointerEvent);
    });

    expect(onLongPress).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith({ x: 200, y: 300 });
  });

  it("cancels when pointer moves beyond threshold", async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.handlePointerDown({
        pointerId: 1,
        clientX: 200,
        clientY: 300,
      } as React.PointerEvent);
    });

    // Move beyond 10px threshold
    act(() => {
      result.current.handlePointerMove({
        pointerId: 1,
        clientX: 215,
        clientY: 300,
      } as React.PointerEvent);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cancels when pointer is released before 600ms", async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => {
      result.current.handlePointerDown({
        pointerId: 1,
        clientX: 200,
        clientY: 300,
      } as React.PointerEvent);
    });

    // Release early
    act(() => {
      result.current.handlePointerUp({
        pointerId: 1,
        clientX: 200,
        clientY: 300,
      } as React.PointerEvent);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
