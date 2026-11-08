export type Row = { id: string; [key: string]: unknown };
export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
export type Me = {
  userId: string;
  shopId: string | null;
  name: string;
  roles: string[];
  sessionId: string;
};
export type Product = Row & {
  version: string;
  name: string;
  barcode: string;
  category: string;
  unit: string;
  salePriceCents: number;
  stock: number;
  minimum: number;
  cartonSize: number;
  archived: boolean;
  averageCostCents: number | null;
  costKnown: boolean;
};
export type Party = Row & { name: string; phone: string; balanceCents: number };
export type InvoiceLine = {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  factor: number;
  unitPriceCents: number;
  totalCents: number;
  unitCostCents: number | null;
};
export type Invoice = Row & {
  number: string;
  date: string;
  partyName: string;
  lines: InvoiceLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  changeCents: number;
  costCents: number | null;
  costComplete: boolean;
  method: string;
  notes: string;
  warnings?: string[];
};
export const text = (v: unknown) => (v == null ? "" : String(v));
export const number = (v: unknown) => Number(v ?? 0);
export const money = (v: unknown) =>
  v == null
    ? "غير مكتمل"
    : `${(number(v) / 100).toLocaleString("ar-PS", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;
export const dateTime = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString("ar-PS") : "—";
export function today() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Hebron",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)?.value)
    .join("-");
}
export const roles: Record<string, string> = {
  Owner: "مالك المحل",
  Cashier: "كاشير",
  Warehouse: "مسؤول مخزون",
  Accountant: "محاسب",
  PlatformAdmin: "مدير النظام",
  Support: "دعم فني",
  Billing: "محاسب الاشتراكات",
};
export const methods: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  credit: "آجل",
  partial: "جزئي",
};
export const kinds: Record<string, string> = {
  "sale.return": "مرتجع بيع",
  "purchase.return": "مرتجع شراء",
  sale: "بيع",
  purchase: "شراء",
  payment: "تسديد",
  opening: "رصيد افتتاحي",
  adjustment: "تسوية جرد",
  manual: "قيد يدوي",
  expense: "مصروف",
  "expense.reversal": "عكس مصروف",
  "customer.payment": "تسديد زبون",
  "supplier.payment": "تسديد مورد",
};
