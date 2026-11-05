/**
 * Single HTTP client for the whole app (auth header, query-string building, envelope unwrapping, errors).
 * Features call `http.get/post/...`; nothing else uses fetch directly.
 */
/** Optional absolute API origin (e.g. https://api.sankatmochansaarthi.com), baked in at build time. Unset = same-origin `/api/v1`. */
const API_ORIGIN = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(/\/+$/, "");
export const API_BASE = `${API_ORIGIN}/api/v1`;
const BASE = API_BASE;
const TOKEN_KEY = "edu.token";

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};

/** Error thrown for every non-2xx response; carries the backend error code and request id for support. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown, public requestId?: string) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

/** Builds `?a=1&b=2` from an object, skipping undefined/null/empty values (filters come from the URL, never the body). */
export function toQueryString(q?: Query): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q ?? {})) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

let onUnauthorized: (() => void) | null = null;
/** AuthProvider registers a callback so an expired session logs the user out. */
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

async function request(method: string, path: string, opts: { query?: Query; json?: unknown; form?: FormData; headers?: Record<string, string> } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.json); }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${toQueryString(opts.query)}`, { method, headers, body });
  } catch {
    // fetch only rejects on network failure (offline, server down, CORS) — give users a readable message.
    throw new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server. Check your internet connection and try again.");
  }
  if (!res.ok) {
    let payload: { error?: { code?: string; message?: string; details?: unknown }; request_id?: string } | null = null;
    try { payload = await res.json(); } catch { /* non-JSON error */ }
    const err = payload?.error;
    if (res.status === 401 && token && err?.code !== "INVALID_CREDENTIALS") onUnauthorized?.();
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Request failed (${res.status})`, err?.details, payload?.request_id ?? res.headers.get("X-Request-Id") ?? undefined);
  }
  return res;
}

const json = async <T,>(p: Promise<Response>): Promise<T> => (await p).json() as Promise<T>;

export const http = {
  /** GET returning the `data` payload. */
  get: async <T,>(path: string, query?: Query) => (await json<{ data: T }>(request("GET", path, { query }))).data,
  /** GET returning `{ data, pagination }`. */
  list: <T,>(path: string, query?: Query) => json<{ data: T[]; pagination: import("../types").Pagination }>(request("GET", path, { query })),
  post: async <T,>(path: string, body?: unknown, headers?: Record<string, string>) => (await json<{ data: T }>(request("POST", path, { json: body ?? {}, headers }))).data,
  patch: async <T,>(path: string, body: unknown) => (await json<{ data: T }>(request("PATCH", path, { json: body }))).data,
  put: async <T,>(path: string, body: unknown) => (await json<{ data: T }>(request("PUT", path, { json: body }))).data,
  delete: async <T,>(path: string) => (await json<{ data: T }>(request("DELETE", path))).data,
  /** multipart/form-data (file uploads). */
  postForm: async <T,>(path: string, form: FormData) => (await json<{ data: T }>(request("POST", path, { form }))).data,
  putForm: async <T,>(path: string, form: FormData) => (await json<{ data: T }>(request("PUT", path, { form }))).data,
  /** Authenticated binary download (PDF preview/download). */
  blob: async (path: string) => (await request("GET", path)).blob(),
};
