/** Exact integer-cent arithmetic, matching the API's decimal rounding away from zero. */
export function cents(input: string): number {
  if (input === "") return 0;
  if (!/^\d+(?:\.\d{0,2})?$/.test(input))
    throw new Error("المبلغ يجب أن يكون موجبًا وحتى منزلتين عشريتين.");
  const [whole, fraction = ""] = input.split(".");
  const result = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
  if (!Number.isSafeInteger(result) || result > 1_000_000_000_000)
    throw new Error("المبلغ خارج النطاق.");
  return result;
}
export function lineTotal(quantity: number, unitCents: number): number {
  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    quantity > 1_000_000 ||
    !Number.isSafeInteger(unitCents) ||
    unitCents < 0
  )
    return 0;
  const raw = String(quantity);
  if (!/^\d+(?:\.\d{1,3})?$/.test(raw)) return 0;
  const [whole, fraction = ""] = raw.split(".");
  const scaled = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  return Number((scaled * BigInt(unitCents) + 500n) / 1000n);
}

export function previewCents(input: string): number {
  try {
    return cents(input);
  } catch {
    return 0;
  }
}
