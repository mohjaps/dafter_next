import "server-only";
import { createHash } from "node:crypto";
import { Decimal } from "./db";

export class ApiFault extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const D = (x: Decimal.Value) => new Decimal(x);
/** decimal.Round(x, n, MidpointRounding.AwayFromZero) */
export const round = (x: Decimal, places = 0) => x.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
export const toNum = (x: Decimal) => x.toNumber();

export const Rules = {
  text(value: unknown, max = 150): string {
    const text = typeof value === "string" ? value.trim() : "";
    if (text.length === 0 || text.length > max) throw new ApiFault(400, `النص مطلوب ولا يتجاوز ${max} حرفًا.`);
    return text;
  },
  optional(value: unknown, max = 500): string {
    const text = typeof value === "string" ? value.trim() : "";
    if (text.length > max) throw new ApiFault(400, "النص أطول من الحد المسموح.");
    return text;
  },
  phone(value: unknown): string {
    const phone = Rules.text(value, 20);
    if (!/^0(59|56)\d{7}$/.test(phone)) throw new ApiFault(400, "رقم الهاتف يجب أن يبدأ بـ059 أو056 ويتكون من10 أرقام.");
    return phone;
  },
  /** Rounds a decimal amount of cents to a whole cent (half away from zero). */
  money(amount: Decimal): number {
    if (amount.lt(0) || amount.gt("1000000000000")) throw new ApiFault(400, "المبلغ خارج النطاق.");
    return round(amount).toNumber();
  },
  cents(amount: number, zero = true) {
    if (amount < (zero ? 0 : 1) || amount > 1_000_000_000_000) throw new ApiFault(400, "المبلغ خارج النطاق المسموح.");
  },
  quantity(value: Decimal, weighted: boolean, allowZero = false) {
    if (
      value.lt(allowZero ? 0 : "0.001") ||
      value.gt(1_000_000) ||
      !round(value, 3).eq(value) ||
      (!weighted && !value.isInteger())
    )
      throw new ApiFault(400, "الكمية غير صالحة. الكسور حتى3 منازل لوحدة كغم فقط.");
  },
  hash(value: string) {
    return createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
  },
  /** Business date in Asia/Hebron as yyyy-mm-dd. */
  today(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hebron", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  },
  isPlatform(role: string) {
    return role === "PlatformAdmin" || role === "Support" || role === "Billing";
  },
};

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dayNumber(date: string) {
  return Math.round(Date.parse(date + "T00:00:00Z") / 86_400_000);
}
export const pad8 = (n: number) => String(n).padStart(8, "0");
export const uuid = () => crypto.randomUUID();

export function checked(n: number): number {
  if (!Number.isSafeInteger(n)) throw new ApiFault(400, "قيمة رقمية خارج النطاق.");
  return n;
}

/** Converts DB rows to API JSON: camelCase keys, Date→ISO string (Decimals are written exactly by stringify). */
export function out<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) result[key.charAt(0).toLowerCase() + key.slice(1)] = plain(value);
  return result as T;
}
function plain(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}
