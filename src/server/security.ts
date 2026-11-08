import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

let warned = false;
function secret(): string {
  const value = process.env.SESSION_SECRET ?? "";
  if (value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  if (!warned) {
    console.warn("SESSION_SECRET is not set; using an insecure development secret.");
    warned = true;
  }
  return "daftar-development-secret-not-for-production-use";
}

export const sign = (purpose: string, value: string) =>
  createHmac("sha256", secret()).update(purpose + "|" + value).digest("base64url");

export function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const randomToken = () => randomBytes(32).toString("base64url");

export const SESSION_COOKIE = "Daftar.Session";
export const CSRF_COOKIE = "Daftar.Csrf";

export function secureCookies() {
  const flag = process.env.COOKIE_SECURE;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function cookie(name: string, value: string, options: { expires?: Date; maxAge?: number } = {}) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secureCookies()) parts.push("Secure");
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}
export const clearCookie = (name: string) => cookie(name, "", { maxAge: 0, expires: new Date(0) });

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/** Fixed-window limiter per client IP (per server instance), like the .NET "auth" policy. */
const windows = new Map<string, { start: number; count: number }>();
export function rateLimited(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || now - entry.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
    return false;
  }
  entry.count++;
  return entry.count > limit;
}
