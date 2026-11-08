/** Cumulative integer rounding matches the API and prevents fractional-return over-refunds. */
function milli(value: number) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !/^\d+(?:\.\d{1,3})?$/.test(String(value))
  )
    throw new Error("الكمية غير صالحة.");
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}
export function returnAmount(
  total: number,
  original: number,
  before: number,
  quantity: number,
) {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("المبلغ غير صالح.");
  const denominator = milli(original),
    start = milli(before),
    amount = milli(quantity);
  if (!denominator || start + amount > denominator)
    throw new Error("الكمية تتجاوز المتبقي.");
  const round = (value: bigint) =>
    (2n * BigInt(total) * value + denominator) / (2n * denominator);
  return Number(round(start + amount) - round(start));
}
