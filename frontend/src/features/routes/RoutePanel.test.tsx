import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScoredRoute } from "../../types";
import { RoutePanel } from "./RoutePanel";

const routeFast: ScoredRoute = {
  id: "route-fast",
  label: "最快路线 A",
  distanceMeters: 2100,
  durationSeconds: 720,
  stressExposure: 67.2,
  stressScore: 50.4,
  confidence: 0.68,
  fastest: true,
  leastStressful: false,
  polyline: [],
};

const routeCalm: ScoredRoute = {
  id: "route-calm",
  label: "少心累路线 B",
  distanceMeters: 2800,
  durationSeconds: 960,
  stressExposure: 30.1,
  stressScore: 25.0,
  confidence: 0.72,
  fastest: false,
  leastStressful: true,
  polyline: [],
};

const realScores = { routeSource: "real", scoringStatus: "valid" } as const;

function expectHiddenScore() {
  expect(screen.getByText("评分待确认")).toBeInTheDocument();
  expect(screen.getByText("—")).toBeInTheDocument();
  expect(screen.queryByText("综合评分")).not.toBeInTheDocument();
  expect(screen.queryByText("环境指数")).not.toBeInTheDocument();
  expect(screen.queryByText("少心累", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("25", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("0", { exact: true })).not.toBeInTheDocument();
}

describe("RoutePanel", () => {
  it("renders nothing when routes are empty", () => {
    const { container } = render(<RoutePanel routes={[]} onSelectRoute={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("separates environment and composite scores from estimated time for trusted routes", () => {
    render(<RoutePanel routes={[routeFast, routeCalm]} selectedRouteId="route-fast" onSelectRoute={vi.fn()} {...realScores} />);

    expect(screen.getByText("最快路线 A")).toBeInTheDocument();
    expect(screen.getByText("少心累路线 B")).toBeInTheDocument();
    expect(screen.getByText("最快")).toBeInTheDocument();
    expect(screen.getByText("少心累")).toBeInTheDocument();
    const calm = within(screen.getByRole("button", { name: "选择 少心累路线 B" }));
    expect(calm.getByText("25", { exact: true })).toBeInTheDocument();
    expect(calm.getByText("综合评分")).toBeInTheDocument();
    expect(calm.getByText("30", { exact: true })).toBeInTheDocument();
    expect(calm.getByText("环境指数")).toBeInTheDocument();
    expect(calm.getAllByText(/^(距离|预计时间|环境指数|综合评分)$/)).toHaveLength(4);
    const fast = within(screen.getByRole("button", { name: "选择 最快路线 A" }));
    expect(fast.getByText("67", { exact: true })).toBeInTheDocument();
    expect(fast.getByText("50", { exact: true })).toBeInTheDocument();
  });

  it("formats distance and duration", () => {
    render(<RoutePanel routes={[routeFast, routeCalm]} onSelectRoute={vi.fn()} {...realScores} />);
    expect(screen.getByText("2.1 km")).toBeInTheDocument();
    expect(screen.getByText("12 分钟")).toBeInTheDocument();
    expect(screen.getByText("2.8 km")).toBeInTheDocument();
    expect(screen.getByText("16 分钟")).toBeInTheDocument();
  });

  it.each([1, 30, 59])("describes a scored %s-second route as less than one minute", (durationSeconds) => {
    render(<RoutePanel routes={[{ ...routeCalm, durationSeconds }]} onSelectRoute={vi.fn()} {...realScores} />);
    expect(screen.getByText("不足一分钟")).toBeInTheDocument();
    expect(screen.getByText("预计时间")).toBeInTheDocument();
    expect(screen.queryByText(/^[01] 分钟$/)).not.toBeInTheDocument();
    expect(screen.getByText("环境指数")).toBeInTheDocument();
    expect(screen.getByText("综合评分")).toBeInTheDocument();
  });

  it("keeps the exact one-minute boundary for a scored route", () => {
    render(<RoutePanel routes={[{ ...routeCalm, durationSeconds: 60 }]} onSelectRoute={vi.fn()} {...realScores} />);
    expect(screen.getByText("1 分钟")).toBeInTheDocument();
    expect(screen.queryByText("不足一分钟")).not.toBeInTheDocument();
  });

  it.each([
    { name: "both missing", props: {} },
    { name: "missing source", props: { scoringStatus: "valid" } },
    { name: "missing scoring status", props: { routeSource: "real" } },
    { name: "DEMO mapped to mock even with valid status", props: { routeSource: "mock", scoringStatus: "valid" } },
    { name: "unknown source even with valid status", props: { routeSource: "unknown", scoringStatus: "valid" } },
    { name: "insufficient data", props: { routeSource: "real", scoringStatus: "insufficient" } },
    { name: "mixed feedback mapped by the parent to none", props: { routeSource: "real", scoringStatus: "none" } },
  ] as const)("hides scores and comfort badges for $name", ({ props }) => {
    render(<RoutePanel routes={[routeCalm]} onSelectRoute={vi.fn()} {...props} />);
    expectHiddenScore();
    expect(screen.getByText("2.8 km")).toBeInTheDocument();
    expect(screen.getByText("16 分钟")).toBeInTheDocument();
  });

  it("warns when the parent explicitly marks route provenance unknown", () => {
    render(<RoutePanel routes={[routeCalm]} onSelectRoute={vi.fn()} routeSource="unknown" scoringStatus="none" />);
    expect(screen.getByRole("status")).toHaveTextContent("路线来源与评分状态待确认");
    expectHiddenScore();
  });

  it.each([
    { name: "missing composite", stressScore: null, stressExposure: 30.1 },
    { name: "missing environment", stressScore: 25, stressExposure: null },
    { name: "both missing", stressScore: null, stressExposure: null },
    { name: "NaN composite", stressScore: Number.NaN, stressExposure: 30.1 },
    { name: "NaN environment", stressScore: 25, stressExposure: Number.NaN },
    { name: "infinite composite", stressScore: Number.POSITIVE_INFINITY, stressExposure: 30.1 },
    { name: "infinite environment", stressScore: 25, stressExposure: Number.NEGATIVE_INFINITY },
    { name: "negative composite", stressScore: -1, stressExposure: 30.1 },
    { name: "negative environment", stressScore: 25, stressExposure: -1 },
    { name: "composite above 100", stressScore: 101, stressExposure: 30.1 },
    { name: "environment above 100", stressScore: 25, stressExposure: 101 },
  ])("does not render an invalid row score for $name", ({ stressScore, stressExposure }) => {
    render(<RoutePanel routes={[{ ...routeCalm, stressScore, stressExposure }]} onSelectRoute={vi.fn()} {...realScores} />);
    expectHiddenScore();
    expect(screen.queryByText(/^(NaN|Infinity|-Infinity)$/)).not.toBeInTheDocument();
  });

  it.each([0, 100])("preserves the valid boundary score %s", (score) => {
    render(<RoutePanel routes={[{ ...routeCalm, stressScore: score, stressExposure: score }]} onSelectRoute={vi.fn()} {...realScores} />);
    expect(screen.getAllByText(String(score), { exact: true })).toHaveLength(2);
    expect(screen.getByText("综合评分")).toBeInTheDocument();
    expect(screen.getByText("环境指数")).toBeInTheDocument();
    expect(screen.getByText("少心累")).toBeInTheDocument();
    expect(screen.queryByText("评分待确认")).not.toBeInTheDocument();
  });

  it("keeps a valid row visible when another row has invalid scores", () => {
    render(<RoutePanel routes={[routeFast, { ...routeCalm, stressScore: null }]} onSelectRoute={vi.fn()} {...realScores} />);
    const fast = within(screen.getByRole("button", { name: "选择 最快路线 A" }));
    const calm = within(screen.getByRole("button", { name: "选择 少心累路线 B" }));
    expect(fast.getByText("50", { exact: true })).toBeInTheDocument();
    expect(fast.getByText("综合评分")).toBeInTheDocument();
    expect(calm.getByText("评分待确认")).toBeInTheDocument();
    expect(calm.queryByText("少心累", { exact: true })).not.toBeInTheDocument();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1])("hides both score displays for invalid confidence %s", (confidence) => {
    render(<RoutePanel routes={[{ ...routeCalm, confidence }]} onSelectRoute={vi.fn()} {...realScores} />);
    expectHiddenScore();
  });

  it.each(["INSUFFICIENT_DATA", "UNAVAILABLE"] as const)("honors the row scoring status %s", (scoringStatus) => {
    render(<RoutePanel routes={[{ ...routeCalm, scoringStatus }]} onSelectRoute={vi.fn()} {...realScores} />);
    expectHiddenScore();
  });

  it.each([true, false])("retains route selection when scores are visible: %s", (showScores) => {
    const onSelectRoute = vi.fn();
    const props = showScores ? realScores : {};
    const { rerender } = render(<RoutePanel routes={[routeFast, routeCalm]} selectedRouteId="route-fast" onSelectRoute={onSelectRoute} {...props} />);
    const fastCard = screen.getByRole("button", { name: "选择 最快路线 A" });
    const calmCard = screen.getByRole("button", { name: "选择 少心累路线 B" });
    expect(fastCard).toHaveAttribute("aria-pressed", "true");
    expect(calmCard).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(calmCard);
    expect(onSelectRoute).toHaveBeenCalledTimes(1);
    expect(onSelectRoute).toHaveBeenCalledWith("route-calm");
    rerender(<RoutePanel routes={[routeFast, routeCalm]} selectedRouteId="route-calm" onSelectRoute={onSelectRoute} {...props} />);
    expect(fastCard).toHaveAttribute("aria-pressed", "false");
    expect(calmCard).toHaveAttribute("aria-pressed", "true");
  });
});
