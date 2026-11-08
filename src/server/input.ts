import "server-only";
import { ApiFault } from "./rules";
import { Decimal } from "./db";

/** Mirrors System.Text.Json model binding: wrong JSON types are a 400, missing values take defaults. */
const bad = () => new ApiFault(400, "صيغة الطلب غير صالحة.");
export type Json = Record<string, unknown>;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const In = {
  obj(v: unknown): Json {
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw bad();
    return v as Json;
  },
  str(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") throw bad();
    return v;
  },
  guid(v: unknown): string {
    const g = In.guidOrNull(v);
    return g ?? "00000000-0000-0000-0000-000000000000";
  },
  guidOrNull(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string" || !GUID.test(v)) throw bad();
    return v.toLowerCase();
  },
  long(v: unknown): number {
    if (v === undefined || v === null) return 0;
    if (typeof v !== "number" || !Number.isSafeInteger(v)) throw bad();
    return v;
  },
  longOrNull(v: unknown): number | null {
    return v === undefined || v === null ? null : In.long(v);
  },
  int(v: unknown, fallback = 0): number {
    if (v === undefined || v === null) return fallback;
    if (typeof v !== "number" || !Number.isInteger(v) || Math.abs(v) > 2_147_483_647) throw bad();
    return v;
  },
  dec(v: unknown): Decimal {
    if (v === undefined || v === null) return new Decimal(0);
    if (typeof v !== "number" || !Number.isFinite(v)) throw bad();
    return new Decimal(String(v));
  },
  decOrNull(v: unknown): Decimal | null {
    return v === undefined || v === null ? null : In.dec(v);
  },
  bool(v: unknown, fallback = false): boolean {
    if (v === undefined || v === null) return fallback;
    if (typeof v !== "boolean") throw bad();
    return v;
  },
  boolOrNull(v: unknown): boolean | null {
    return v === undefined || v === null ? null : In.bool(v);
  },
  /** DateOnly; null stands for default(DateOnly). */
  date(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string" || !DATE.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z")) || new Date(v + "T00:00:00Z").toISOString().slice(0, 10) !== v) throw bad();
    return v === "0001-01-01" ? null : v;
  },
  arr(v: unknown): Json[] | null {
    if (v === undefined || v === null) return null;
    if (!Array.isArray(v)) throw bad();
    return v.map(In.obj);
  },
};

export function queryInt(q: URLSearchParams, name: string, fallback: number) {
  const raw = q.get(name);
  if (raw === null || raw === "") return fallback;
  if (!/^-?\d+$/.test(raw)) throw bad();
  return Number(raw);
}
export function queryDate(q: URLSearchParams, name: string): string | null {
  const raw = q.get(name);
  if (!raw) return null;
  return In.date(raw);
}
export function queryGuid(q: URLSearchParams, name: string): string | null {
  const raw = q.get(name);
  if (!raw) return null;
  return In.guidOrNull(raw);
}
export function paging(q: URLSearchParams, size = 20): [number, number] {
  const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
  return [clamp(queryInt(q, "page", 1), 1, 100000), clamp(queryInt(q, "pageSize", size), 1, 100)];
}
