const API_BASE_KEY = "commute-api-base";

function getApiBase(): string {
  const userUrl = localStorage.getItem(API_BASE_KEY);
  if (userUrl !== null) return userUrl;
  return import.meta.env.VITE_API_BASE_URL ?? "";
}

export function setApiBase(url: string): void {
  localStorage.setItem(API_BASE_KEY, url);
}

export function clearApiBase(): void {
  localStorage.removeItem(API_BASE_KEY);
}

export function getApiBaseDisplay(): string {
  return localStorage.getItem(API_BASE_KEY) ?? import.meta.env.VITE_API_BASE_URL ?? "";
}
const FETCH_TIMEOUT_MS = 8_000;
const NO_BACKEND = "__OFFLINE__";

function deviceId(): string {
  const key = "commute-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Device-Id": deviceId(),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const signal = (options as { signal?: AbortSignal }).signal;
  const timeoutController = signal ? null : new AbortController();
  if (timeoutController) {
    setTimeout(() => timeoutController.abort(), FETCH_TIMEOUT_MS);
  }

  const base = getApiBase();
  if (base === NO_BACKEND) {
    throw new Error("后端地址未配置，请在欢迎页设置服务器地址或使用离线模式");
  }

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...options,
      headers,
      signal: signal ?? timeoutController?.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("请求超时：服务器无响应，请检查网络或使用离线模式");
    }
    if (err instanceof Error && err.message) {
      throw err;
    }
    throw new Error("无法连接到服务器，请检查网络或后端地址配置");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }

  const contentType = res.headers?.get("content-type") ?? "";
  if (contentType && !contentType.includes("application/json")) {
    throw new Error(
      `服务器返回了非 JSON 响应（${contentType}），请确认 VITE_API_BASE_URL 指向正确的后端地址`,
    );
  }

  try {
    return await res.json() as T;
  } catch {
    throw new Error(
      "服务器返回了无法解析的响应，请确认 VITE_API_BASE_URL 指向正确的后端地址",
    );
  }
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body: unknown, signal?: AbortSignal) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),
};
