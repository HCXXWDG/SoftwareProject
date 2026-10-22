import { spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";
import { createConnection } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, test, type Page } from "@playwright/test";

const apiUrl = "http://127.0.0.1:18085";
const comparePath = "/api/v1/routes/compare";
const completePath = "/api/v1/commutes/complete";
interface OwnedService {
  child: ChildProcess;
  logs: string[];
  closed: boolean;
  exited: Promise<void>;
  error?: Error;
}

async function withDeadline<T>(value: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolveValue, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    value.then(result => { clearTimeout(timer); resolveValue(result); }, failure => { clearTimeout(timer); reject(failure); });
  });
}

async function requireFreePort() {
  await new Promise<void>((resolveFree, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port: 18085 });
    const finish = (failure?: Error) => {
      socket.destroy();
      if (failure) reject(failure); else resolveFree();
    };
    socket.once("connect", () => finish(new Error("Port 18085 is already occupied; this test will not stop another service.")));
    socket.once("error", failure => {
      if ((failure as NodeJS.ErrnoException).code === "ECONNREFUSED") finish();
      else finish(failure);
    });
    socket.setTimeout(1000, () => finish(new Error("Could not verify that port 18085 is free.")));
  });
}

async function startBackend(backendDir: string, owned: OwnedService[]) {
  await requireFreePort();
  const jar = join(backendDir, "target", "commute-mood-api-1.0.0.jar");
  if (!(await stat(jar)).isFile()) throw new Error(`Build the reviewed D07 backend JAR before running: ${jar}`);
  const executable = process.env.MEMBER_A_RESTART_JAVA
    ?? (process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : "java");
  const child = spawn(executable, ["-jar", jar, "--spring.profiles.active=demo", "--server.port=18085",
    "--app.amap.web-key=", "--app.routing.demo-enabled=true",
    "--app.cors-origins=http://127.0.0.1:5405,http://localhost:5405", "--spring.output.ansi.enabled=never"], {
    cwd: backendDir,
    env: { ...process.env, SPRING_PROFILES_ACTIVE: "demo", AMAP_WEB_KEY: "", ROUTE_DEMO_ENABLED: "true",
      APP_CORS_ORIGINS: "http://127.0.0.1:5405,http://localhost:5405" },
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let markExited!: () => void;
  const service: OwnedService = { child, logs: [], closed: false, exited: new Promise<void>(done => { markExited = done; }) };
  owned.push(service);
  child.stdout?.on("data", chunk => service.logs.push(String(chunk)));
  child.stderr?.on("data", chunk => service.logs.push(String(chunk)));
  child.once("error", failure => { service.error = failure; });
  child.once("close", () => { service.closed = true; markExited(); });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (service.error) throw service.error;
    if (service.closed) throw new Error("The owned D07 backend exited before it became ready.");
    // Health alone could belong to another process; require this child's Tomcat readiness as well.
    if (/Tomcat started on port\s+18085\b/.test(service.logs.join(""))) {
      try {
        const response = await fetch(`${apiUrl}/actuator/health`, { signal: AbortSignal.timeout(1000) });
        if (response.status === 200 && (await response.json() as { status?: string }).status === "UP") return service;
      } catch { /* Wait for this service's health endpoint within the startup deadline. */ }
    }
    await delay(100);
  }
  throw new Error("The owned D07 backend did not report Tomcat readiness and healthy status within 30 seconds.");
}

async function stopBackend(service: OwnedService) {
  if (service.closed) return;
  // A direct Java child, never an arbitrary PID or a process discovered from the port.
  service.child.kill("SIGTERM");
  try { await withDeadline(service.exited, 5000, "The owned backend did not stop after SIGTERM."); }
  catch {
    service.child.kill("SIGKILL");
    await withDeadline(service.exited, 5000, "Could not stop the owned D07 backend.");
  }
}

async function expectNoAutomaticWrite(page: Page) {
  const observed = await page.waitForRequest(request => request.method() === "POST"
    && new URL(request.url()).pathname === completePath, { timeout: 1000 })
    .then(() => true, failure => {
      expect(failure).toHaveProperty("name", "TimeoutError");
      return false;
    });
  expect(observed).toBe(false);
}

test("a saved operation keeps its identity after an isolated demo backend restart loses the snapshot", async ({ page }, testInfo) => {
  const requestedDir = process.env.MEMBER_A_D07_BACKEND_DIR;
  if (!requestedDir) throw new Error("Set MEMBER_A_D07_BACKEND_DIR to the reviewed, built D07 backend directory.");
  const backendDir = resolve(requestedDir);
  const owned: OwnedService[] = [];
  let testFailed = false;
  try {
    const first = await startBackend(backendDir, owned);
    const comparisonResponse = page.waitForResponse(response => response.request().method() === "POST"
      && new URL(response.url()).pathname === comparePath);
    await page.goto("/");
    await page.getByRole("button", { name: "查看路线", exact: true }).click();
    const initial = await (await comparisonResponse).json();
    expect(initial.routeSource).toBe("DEMO");
    expect(initial.snapshotId).toMatch(/^[a-f0-9-]{36}$/i);
    await page.getByRole("button", { name: "进入地图", exact: true }).click();
    await expect(page.getByText(/数据服务：可连接/)).toBeVisible();

    const bodies: unknown[] = [];
    await page.route(`**${completePath}`, async route => {
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 1) {
        const saved = await route.fetch();
        expect(saved.status()).toBe(201);
        expect(await saved.json()).toMatchObject({ status: "created", routeSource: "DEMO" });
        // Only drop a real receipt after the isolated backend has actually saved the record.
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "25 · 比较轻松", exact: true }).click();
    await page.getByRole("button", { name: "完成本次通勤", exact: true }).click();
    await expect(page.getByRole("button", { name: "重试原通勤", exact: true })).toBeEnabled();
    expect(bodies).toHaveLength(1);
    const originalPending = await page.evaluate(() => sessionStorage.getItem("commute-pending-v1"));
    expect(originalPending).not.toBeNull();
    const originalRequest = JSON.parse(originalPending!).request;
    expect(originalRequest).toMatchObject({ snapshotId: initial.snapshotId, endStressLevel: 25 });
    expect(bodies[0]).toEqual(originalRequest);

    await stopBackend(first);
    const second = await startBackend(backendDir, owned);
    expect(second.child.pid).toBeDefined();
    expect(second.child.pid).not.toBe(first.child.pid);
    const newComparisonResponse = page.waitForResponse(response => response.request().method() === "POST"
      && new URL(response.url()).pathname === comparePath);
    await page.reload();
    const replacement = await (await newComparisonResponse).json();
    expect(replacement.snapshotId).toMatch(/^[a-f0-9-]{36}$/i);
    expect(replacement.snapshotId).not.toBe(initial.snapshotId);
    await expect(page.getByRole("heading", { name: "路线预览", exact: true })).toBeVisible();
    await expectNoAutomaticWrite(page);
    expect(bodies).toHaveLength(1);

    const panel = page.getByRole("region", { name: "通勤记录", exact: true });
    for (const attempt of [2, 3]) {
      const failureResponse = page.waitForResponse(response => response.request().method() === "POST"
        && new URL(response.url()).pathname === completePath);
      await panel.getByRole("button", { name: "重试原通勤", exact: true }).click();
      const failure = await failureResponse;
      expect(failure.status()).toBe(404);
      expect(await failure.json()).toMatchObject({ status: 404, code: "snapshot_not_found" });
      await expect(panel.getByRole("alert")).toHaveText("路线快照已失效，但不能据此判断上次通勤是否保存。请先核对记录，当前保留原操作信息。");
      expect(bodies).toHaveLength(attempt);
      expect(bodies[attempt - 1]).toEqual(originalRequest);
      expect(await page.evaluate(() => sessionStorage.getItem("commute-pending-v1"))).toBe(originalPending);
      await expect(panel.getByRole("button", { name: "开始下一次通勤", exact: true })).toHaveCount(0);
      await expect(panel.getByRole("button", { name: "完成本次通勤", exact: true })).toHaveCount(0);
    }
  } catch (failure) {
    testFailed = true;
    throw failure;
  } finally {
    const cleanup = await Promise.allSettled(owned.map(stopBackend));
    for (let index = 0; index < owned.length; index++) {
      await testInfo.attach(`d07-restart-boot-${index + 1}.log`, {
        body: Buffer.from(owned[index].logs.join("")), contentType: "text/plain",
      });
    }
    const failedCleanup = cleanup.find(result => result.status === "rejected");
    if (!testFailed && failedCleanup?.status === "rejected") throw failedCleanup.reason;
  }
});
