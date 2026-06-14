import { describe, expect, it } from "vitest";
import { snapStressLevel } from "../../App";

describe("snapStressLevel", () => {
  it.each([
    [0, 0],
    [25, 25],
    [37, 25],
    [62, 50],
    [89, 100],
  ])("snaps %i to nearest valid level %i", (input, expected) => {
    expect(snapStressLevel(input)).toBe(expected);
  });
});
