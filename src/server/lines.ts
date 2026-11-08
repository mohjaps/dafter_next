import "server-only";
import { Decimal } from "./db";

/** JSON with exact decimals (like System.Text.Json writing System.Decimal). */
export function stringify(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, v) {
    const original = this[key];
    if (original instanceof Decimal) return JSON.rawJSON(original.toString());
    return v;
  });
}

const DECIMAL_KEYS = new Set(["quantity", "unitCostCents"]);
type Source = { source?: string };
/** Parses stored lines JSON, reading decimal fields from their exact source text. */
export function parseJson<T>(text: string): T {
  const parse = JSON.parse as (text: string, reviver: (key: string, value: unknown, context?: Source) => unknown) => unknown;
  return parse(text, (key, value, context) =>
    DECIMAL_KEYS.has(key) && typeof value === "number" ? new Decimal(context?.source ?? String(value)) : value,
  ) as T;
}

export type InvoiceLine = {
  productId: string;
  name: string;
  unit: string;
  quantity: Decimal;
  factor: number;
  unitPriceCents: number;
  totalCents: number;
  unitCostCents: Decimal;
};
export type ReturnedLine = {
  productId: string;
  name: string;
  unit: string;
  factor: number;
  quantity: Decimal;
  unitPriceCents: number;
  totalCents: number;
  costCents: number;
};
