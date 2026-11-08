import "server-only";
import { Actor } from "./actor";
import { ApiFault } from "./rules";
import { stringify } from "./lines";
import { CSRF_COOKIE, SESSION_COOKIE, clearCookie, rateLimited, readCookie, same, sign } from "./security";

export type Ctx = {
  req: Request;
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  actor: Actor;
  ip: string;
  setCookies: string[];
  body(): Promise<unknown>;
};
export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
type Route = { method: string; segments: string[]; handler: Handler; anonymous: boolean; limit: boolean };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 1_048_576;

export class Router {
  private routes: Route[] = [];
  add(method: string, pattern: string, handler: Handler, options: { anonymous?: boolean; limit?: boolean } = {}) {
    this.routes.push({ method, segments: pattern.split("/").filter(Boolean), handler, anonymous: !!options.anonymous, limit: !!options.limit });
    return this;
  }
  get = (p: string, h: Handler, o?: { anonymous?: boolean; limit?: boolean }) => this.add("GET", p, h, o);
  post = (p: string, h: Handler, o?: { anonymous?: boolean; limit?: boolean }) => this.add("POST", p, h, o);
  patch = (p: string, h: Handler, o?: { anonymous?: boolean; limit?: boolean }) => this.add("PATCH", p, h, o);

  match(method: string, path: string): { route: Route; params: Record<string, string> } | "method" | null {
    const parts = path.split("/").filter(Boolean);
    let methodMismatch = false;
    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      const ok = route.segments.every((segment, i) => {
        if (segment.startsWith(":")) {
          if (!GUID.test(parts[i])) return false;
          params[segment.slice(1)] = parts[i].toLowerCase();
          return true;
        }
        return segment === parts[i];
      });
      if (!ok) continue;
      if (route.method !== method) {
        methodMismatch = true;
        continue;
      }
      return { route, params };
    }
    return methodMismatch ? "method" : null;
  }
}

/** Raw JSON text response (used for replayed idempotent commands). */
export class RawJson {
  constructor(public text: string) {}
}
export const noContent = () => new Response(null, { status: 204 });

export function csrfToken(cookieValue: string, userId: string | null) {
  return sign("csrf", cookieValue + "|" + (userId ?? ""));
}

function problem(status: number, title: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ type: `https://tools.ietf.org/html/rfc9110`, title, status, ...extra }), {
    status,
    headers: { "Content-Type": "application/problem+json; charset=utf-8" },
  });
}

function finish(response: Response, ctx: Pick<Ctx, "setCookies">) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "no-cache, no-store");
  headers.set("Pragma", "no-cache");
  for (const c of ctx.setCookies) headers.append("Set-Cookie", c);
  return new Response(response.body, { status: response.status, headers });
}

export async function dispatch(router: Router, req: Request, path: string): Promise<Response> {
  const method = req.method.toUpperCase();
  const url = new URL(req.url);
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
  let parsed: unknown;
  let read = false;
  const ctx: Ctx = {
    req,
    method,
    path,
    params: {},
    query: url.searchParams,
    actor: new Actor(),
    ip,
    setCookies: [],
    async body() {
      if (read) return parsed;
      read = true;
      const text = await req.text();
      if (Buffer.byteLength(text) > MAX_BODY) throw new ApiFault(413, "صيغة الطلب غير صالحة.");
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        throw new ApiFault(400, "صيغة الطلب غير صالحة.");
      }
      if (parsed === null) throw new ApiFault(400, "صيغة الطلب غير صالحة.");
      return parsed;
    },
  };
  try {
    const length = Number(req.headers.get("content-length") || 0);
    if (length > MAX_BODY) throw new ApiFault(413, "صيغة الطلب غير صالحة.");

    // Authentication: signed session cookie -> active session row -> active user.
    const raw = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
    let authenticated = false;
    if (raw) {
      const [sid, signature] = raw.split(".");
      if (sid && signature && GUID.test(sid) && same(signature, sign("session", sid)) && (await ctx.actor.load(sid))) {
        authenticated = true;
        if (!path.startsWith("/auth/") && path !== "/auth") await ctx.actor.checkSubscription();
      } else {
        ctx.actor = new Actor();
        ctx.setCookies.push(clearCookie(SESSION_COOKIE));
      }
    }

    // Antiforgery on every state-changing API request.
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const cookieValue = readCookie(req.headers.get("cookie"), CSRF_COOKIE);
      const header = req.headers.get("x-csrf-token") ?? "";
      if (!cookieValue || !header || !same(header, csrfToken(cookieValue, authenticated ? ctx.actor.userId : null)))
        throw new ApiFault(400, "رمز حماية الطلب مفقود أو غير صالح. أعد طلب /auth/csrf.");
    }

    const found = router.match(method, path);
    if (found === null) return finish(problem(404, "غير موجود."), ctx);
    if (found === "method") return finish(problem(405, "الطريقة غير مسموحة."), ctx);
    const { route, params } = found;
    ctx.params = params;
    if (route.limit && rateLimited("auth:" + ip)) return finish(problem(429, "طلبات كثيرة. حاول بعد دقيقة."), ctx);
    if (!route.anonymous && !authenticated) return finish(problem(401, "سجّل الدخول."), ctx);

    const result = await route.handler(ctx);
    if (result instanceof Response) return finish(result, ctx);
    const text = result instanceof RawJson ? result.text : stringify(result);
    return finish(new Response(text, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }), ctx);
  } catch (e) {
    return finish(failure(e), ctx);
  }
}

function failure(e: unknown): Response {
  if (e instanceof ApiFault) return problem(e.status, e.message);
  const pg = e as { code?: string; name?: string };
  if (pg?.code === "23505") return problem(409, "السجل أو الباركود أو الهاتف موجود بالفعل.");
  if (pg?.code === "22003" || pg?.code === "22P02") return problem(400, "قيمة رقمية خارج النطاق.");
  const traceId = crypto.randomUUID();
  console.error("Request failed", traceId, e);
  return problem(500, "تعذر إكمال الطلب.", { traceId });
}
