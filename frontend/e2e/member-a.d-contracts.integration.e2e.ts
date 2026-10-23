import { test, expect, type Page } from "@playwright/test";

const api = (page: Page, path: string, method = "GET") => page.waitForResponse((response) =>
  new URL(response.url()).pathname === `/api/v1/${path}` && response.request().method() === method);

test("D03 正向标签可经真实服务提交并通过前端热力校验", async ({ page }) => {
  await page.goto("/");
  for (const [index, tag] of ["QUIET", "SHADE", "OPEN"].entries()) {
    const location = { longitude: 120.284176 + index * 0.0008, latitude: 31.566176 };
    const bbox = `${location.longitude - 0.00001},${location.latitude - 0.00001},${location.longitude + 0.00001},${location.latitude + 0.00001}`;
    const result = await page.evaluate(async (input) => {
      const reportModule = "/src/services/report.ts";
      const heatmapModule = "/src/services/heatmap.ts";
      const { submitReport } = await import(reportModule);
      const { fetchHeatmap } = await import(heatmapModule);
      const report = await submitReport({ location: input.location, stressLevel: 0, tag: input.tag });
      return { report, cells: await fetchHeatmap(input.bbox, 18) };
    }, { tag, location, bbox });
    expect(result.report).toMatchObject({ status: "created", code: "report_created", counted: true });
    expect(result.cells.length).toBeGreaterThan(0);
    expect(result.cells.some((cell: { dominantTag: string }) => cell.dominantTag === tag)).toBe(true);
  }
});

test("D05 空日期保留空均值并回显自然日与来源口径", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/services/commute.ts";
    const { fetchTrends } = await import(modulePath);
    return fetchTrends(7, "Asia/Shanghai");
  });
  expect(result).toMatchObject({ days: 7, timezone: "Asia/Shanghai", totalCommutes: 0,
    unknownSourceCommutes: 0, excludedDemoCommutes: 0, deduplicatedCommutes: 0, outOfWindowCommutes: 0 });
  expect(result.points).toHaveLength(7);
  for (let index = 0; index < result.points.length; index++) {
    const point = result.points[index];
    expect(point).toMatchObject({ commuteCount: 0, averageStress: null, averageEstimatedSeconds: null, estimatedSampleCount: 0 });
    if (index) expect(Date.parse(point.date) - Date.parse(result.points[index - 1].date)).toBe(86_400_000);
  }
  expect(result.summary.averageStress).toBeNull();
  expect(result.summary.stressDelta).toBeNull();
});

test("D02 服务层以测试快照写入且重试幂等，页面仍等待B契约", async ({ page }) => {
  await page.goto("/");
  const comparisonResponse = api(page, "routes/compare", "POST");
  await page.getByRole("button", { name: "查看路线", exact: true }).click();
  const comparison = await (await comparisonResponse).json();
  // B has not exposed snapshotId/source in compare. Test setup reads D's saved history ID;
  // the application must not use this workaround to enable commute completion.
  expect(comparison).not.toHaveProperty("snapshotId");
  const historyResponse = api(page, "routes/history");
  await page.getByRole("button", { name: "进入地图", exact: true }).click();
  const history = await (await historyResponse).json();
  expect(history.length).toBeGreaterThan(0);
  const input = { snapshotId: history[0].id, routeId: comparison.routes[0].id,
    operationId: crypto.randomUUID(), endStressLevel: 0 };
  const invoke = (value: typeof input) => page.evaluate(async (request) => {
    const modulePath = "/src/services/commute.ts";
    const { completeCommute } = await import(modulePath);
    try {
      return { result: await completeCommute({ ...request, selectedScore: -100, durationMinutes: 0 }) };
    } catch (error) {
      const failure = error as { status?: number; code?: string; kind?: string; message?: string };
      return { error: { status: failure.status, code: failure.code, kind: failure.kind, message: failure.message } };
    }
  }, value);
  const createdResponse = api(page, "commutes/complete", "POST");
  const created = await invoke(input);
  const first = await createdResponse;
  expect(first.status()).toBe(201);
  expect(Object.keys(first.request().postDataJSON()).sort()).toEqual(["endStressLevel", "operationId", "routeId", "snapshotId"]);
  expect(created.result).toMatchObject({ status: "created", snapshotId: input.snapshotId,
    operationId: input.operationId, routeId: input.routeId, endStressLevel: 0, routeSource: "UNKNOWN" });
  const duplicateResponse = api(page, "commutes/complete", "POST");
  const duplicate = await invoke(input);
  expect((await duplicateResponse).status()).toBe(200);
  expect(duplicate.result).toMatchObject({ status: "duplicate", commuteId: created.result.commuteId });
  expect((await invoke({ ...input, endStressLevel: 25 })).error).toMatchObject({ status: 409, code: "operation_conflict" });
  expect((await invoke({ ...input, snapshotId: crypto.randomUUID(), operationId: crypto.randomUUID() })).error)
    .toMatchObject({ status: 404, code: "snapshot_not_found" });
  const trendResponse = api(page, "commutes/trends");
  await page.getByRole("button", { name: "重试或刷新趋势" }).click();
  const trend = await (await trendResponse).json();
  expect(trend).toMatchObject({ totalCommutes: 1, unknownSourceCommutes: 1 });
  await expect(page.getByText("含 1 次来源待确认的通勤，不能视为真实路线评分。")).toBeVisible();
  await expect(page.getByRole("button", { name: "完成本次通勤" })).toBeDisabled();
});
