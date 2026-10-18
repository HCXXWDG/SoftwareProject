const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS);
export const DEFAULT_API_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 10_000;

export type ApiErrorKind = "network" | "timeout" | "cancelled" | "http" | "business" | "format";

/** All request failures have a safe message that can be displayed directly in the UI. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(kind: ApiErrorKind, message: string, details: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = details.status;
    this.code = details.code;
  }
}

export function isRequestCancelled(error: unknown): boolean {
  return error instanceof ApiError && error.kind === "cancelled";
}

export type ResponseValidator<T> = (value: unknown) => value is T;

export interface ApiRequestOptions<T> {
  signal?: AbortSignal;
  /** Positive milliseconds; the deadline includes reading and validating the response body. */
  timeoutMs?: number;
  validate?: ResponseValidator<T>;
}

interface DeviceIdentityState {
  id: string;
  storageRestricted: boolean;
}

let identity: DeviceIdentityState | undefined;

function newDeviceId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  // Older embedded browsers may not implement randomUUID. This is an anonymous session ID.
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function deviceIdentity(): DeviceIdentityState {
  if (identity) return identity;
  let id: string | undefined;
  try {
    const stored = globalThis.localStorage.getItem("commute-device-id");
    if (stored && stored.trim() && stored.length <= 128) id = stored;
    if (!id) {
      id = newDeviceId();
      globalThis.localStorage.setItem("commute-device-id", id);
    }
    identity = { id, storageRestricted: false };
  } catch {
    // Keep the same ID for every request in this page session, including failed writes.
    identity = { id: id ?? newDeviceId(), storageRestricted: true };
  }
  return identity;
}

export function getDeviceIdentityState(): { storageRestricted: boolean; message: string | null } {
  const { storageRestricted } = deviceIdentity();
  return {
    storageRestricted,
    message: storageRestricted
      ? "浏览器存储受限，当前使用临时设备标识；刷新或关闭页面后可能无法找回本次通勤记录。"
      : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeServerMessage(value: unknown): string | undefined {
  // Never display HTML or raw proxy/error pages. Prefer localized messages over English internals.
  if (typeof value !== "string" || !/[\u3400-\u9fff]/.test(value)
      || /[<>\u0000-\u001f]/.test(value) || value.length > 300) return undefined;
  return value;
}

function responseError(status: number, body: unknown): ApiError {
  const record = isRecord(body) ? body : undefined;
  const code = typeof record?.code === "string" ? record.code
    : record?.status === "duplicate" ? "duplicate" : undefined;
  const messages: Record<string, string> = {
    invalid_request: "提交的信息有误，请检查后重试。",
    duplicate: "五分钟内已提交过附近路段，请稍后再试。",
    rate_limited: "操作过于频繁，请稍后再试。",
  };
  const fallback = status >= 500 ? "服务暂时不可用，请稍后重试。"
    : status === 401 ? "当前身份已失效，请刷新页面后重试。"
    : status === 403 ? "当前设备无权执行此操作。"
    : status === 404 ? "请求的服务不存在，请检查后端地址配置。"
    : status === 409 ? "提交内容发生冲突，请重新确认后再试。"
    : status === 429 ? messages.rate_limited
    : status === 400 ? messages.invalid_request
    : `服务器请求失败（HTTP ${status}），请稍后重试。`;
  const message = status >= 500 ? fallback
    : safeServerMessage(record?.message) ?? (code ? messages[code] : undefined) ?? fallback;
  return new ApiError(code && status < 500 ? "business" : "http", message, { status, code });
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return typeof value === "object" && value !== null
    && "aborted" in value && "addEventListener" in value;
}

function normalizeOptions<T>(
  signalOrOptions?: AbortSignal | ApiRequestOptions<T>,
  validate?: ResponseValidator<T>,
): ApiRequestOptions<T> {
  return isAbortSignal(signalOrOptions)
    ? { signal: signalOrOptions, validate }
    : { ...signalOrOptions, validate: validate ?? signalOrOptions?.validate };
}

async function request<T>(path: string, init: RequestInit, options: ApiRequestOptions<T>): Promise<T> {
  if (options.signal?.aborted) throw new ApiError("cancelled", "请求已取消。");
  const controller = new AbortController();
  let abortError: ApiError | undefined;
  let rejectAbort: (error: ApiError) => void = () => undefined;
  const abortPromise = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = (kind: "cancelled" | "timeout") => {
    if (abortError) return;
    abortError = new ApiError(kind, kind === "timeout"
      ? init.method === "POST"
        ? "请求超时；提交操作可能已保存，请勿重复创建，请按页面提示恢复。"
        : "请求超时，请检查网络后重试。"
      : "请求已取消。");
    rejectAbort(abortError);
    controller.abort();
  };
  const onCancel = () => abort("cancelled");
  options.signal?.addEventListener("abort", onCancel, { once: true });
  const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0
    ? options.timeoutMs! : DEFAULT_API_TIMEOUT_MS;
  const timer = setTimeout(() => abort("timeout"), timeoutMs);

  try {
    // Race the complete operation so a body reader that ignores AbortSignal cannot hang the UI.
    const operation = async (): Promise<T> => {
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", "X-Device-Id": deviceIdentity().id },
        signal: controller.signal,
      });
      if (!res.ok) {
        let body: unknown;
        try { body = await res.json(); } catch { /* A proxy may return an HTML error page. */ }
        throw responseError(res.status, body);
      }
      const contentType = res.headers?.get("content-type") ?? "";
      if (contentType && !/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) {
        throw new ApiError("format", "服务器返回了非 JSON 响应，请检查后端地址配置。");
      }
      let body: unknown;
      try { body = await res.json(); }
      catch { throw new ApiError("format", "服务器返回了无法解析的响应，请稍后重试。"); }
      if (isRecord(body) && (body.status === "duplicate" || body.success === false)) {
        throw responseError(body.status === "duplicate" ? 409 : 400, body);
      }
      if (options.validate && !options.validate(body)) {
        throw new ApiError("format", "服务器返回的数据格式不完整，请稍后重试或联系项目成员核对接口。");
      }
      return body as T;
    };
    return await Promise.race([operation(), abortPromise]);
  } catch (error) {
    if (abortError) throw abortError;
    if (error instanceof ApiError) throw error;
    throw new ApiError("network", "无法连接到服务器，请检查网络或后端地址配置。");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onCancel);
  }
}

/** Requests are attempted exactly once. User-driven retries belong to the calling flow. */
export const api = {
  get: <T>(path: string, signalOrOptions?: AbortSignal | ApiRequestOptions<T>, validate?: ResponseValidator<T>) =>
    request<T>(path, {}, normalizeOptions(signalOrOptions, validate)),
  post: <T>(path: string, body: unknown, signalOrOptions?: AbortSignal | ApiRequestOptions<T>, validate?: ResponseValidator<T>) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, normalizeOptions(signalOrOptions, validate)),
};
