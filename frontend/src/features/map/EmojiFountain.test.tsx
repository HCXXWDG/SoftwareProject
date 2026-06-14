import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmojiFountain } from "./EmojiFountain";

afterEach(() => {
  vi.useRealTimers();
});

describe("EmojiFountain", () => {
  it("renders the correct number of particles", () => {
    render(
      <EmojiFountain
        emoji="😊"
        position={{ x: 100, y: 200 }}
        onComplete={vi.fn()}
      />,
    );

    const container = screen.getByTestId("emoji-fountain");
    const particles = container.querySelectorAll(".map-surface__emoji-particle");
    expect(particles).toHaveLength(7);
    particles.forEach((p) => {
      expect(p.textContent).toBe("😊");
    });
  });

  it("calls onComplete after animation duration", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();

    render(
      <EmojiFountain
        emoji="😫"
        position={{ x: 100, y: 200 }}
        onComplete={onComplete}
      />,
    );

    expect(onComplete).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(900);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
