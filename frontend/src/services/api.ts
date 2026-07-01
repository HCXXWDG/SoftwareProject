const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

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

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
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
