"use client";
/** Cookie session transport with CSRF and idempotent command headers. */
export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  constructor(
    status: number,
    message: string,
    errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}
const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1").replace(
  /\/$/,
  "",
);
let csrfPromise: Promise<string> | null = null;
async function csrf(): Promise<string> {
  csrfPromise ??= fetch(`${baseUrl}/auth/csrf`, {
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  })
    .then(async (response) => {
      if (!response.ok)
        throw new ApiError(response.status, "تعذر بدء جلسة الطلب.");
      return ((await response.json()) as { token: string }).token;
    })
    .catch((error) => {
      csrfPromise = null;
      throw error;
    });
  return csrfPromise;
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  try {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body && !(options.body instanceof FormData))
      headers.set("Content-Type", "application/json");
    const method = (options.method || "GET").toUpperCase();
    if (!["GET", "HEAD"].includes(method)) {
      headers.set("X-CSRF-TOKEN", await csrf());
      if (!headers.has("Idempotency-Key"))
        headers.set("Idempotency-Key", crypto.randomUUID());
    }
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      signal,
      credentials: "include",
      cache: "no-store",
    });
    if (
      ["/auth/verify", "/auth/admin-login", "/auth/logout"].includes(path) &&
      response.ok
    )
      csrfPromise = null;
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      if (response.status === 401) {
        csrfPromise = null;
        if (path !== "/auth/me" && !path.startsWith("/auth/"))
          window.dispatchEvent(new Event("daftar-session-expired"));
      }
      throw new ApiError(
        response.status,
        problem.detail || problem.title || `تعذر الطلب (${response.status})`,
        problem.errors,
      );
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      signal.aborted ? "انتهت مهلة الطلب." : "تعذر الاتصال بالخادم.",
    );
  } finally {
    clearTimeout(timer);
  }
}
export function post<T>(
  path: string,
  body: unknown,
  idempotencyKey: string = crypto.randomUUID(),
) {
  return request<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Idempotency-Key": idempotencyKey },
  });
}
