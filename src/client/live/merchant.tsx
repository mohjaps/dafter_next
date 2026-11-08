"use client";
import { InvoiceView } from "./invoice";
export { InvoiceView } from "./invoice";
import { InvoiceDetails } from "./invoiceDetails";
import { cents, lineTotal, previewCents } from "./money";
import { useCommand, useData, useList } from "./data";
import { useState, useEffect } from "react";
import type { PaperWidth } from "./thermal";
import { Link } from "@/client/router";
import { Plus, Trash2, Printer, Check } from "lucide-react";
import { useSession } from "./auth";
import {
  Action,
  EditButton,
  Heading,
  ItemList,
  ListPanel,
  SettingsForm,
  Status,
  Table,
  Pager,
} from "./ui";
import type { Field, Column } from "./ui";
import type { Row, Product, Party, Invoice, Page } from "./types";
import {
  text,
  number,
  money,
  dateTime,
  today,
  roles,
  methods,
  kinds,
} from "./types";
const named = (label: string, key: string): Column => ({
  label,
  render: (r) => text(r[key]) || "—",
});
const priced = (label: string, key: string): Column => ({
  label,
  render: (r) => money(r[key]),
});
const dated: Column = { label: "التاريخ", render: (r) => dateTime(r.date) };
const roleOptions = (items: string[]) =>
  items.map((value) => ({ value, label: roles[value] }));
function useCan(...allowed: string[]) {
  return useSession().me!.roles.some((r) => allowed.includes(r));
}
export function Picker<T extends Row>({
  path,
  label,
  onPick,
  display,
}: {
  path: string;
  label: string;
  onPick: (r: T) => void;
  display?: (r: T) => string;
}) {
  const [query, setQuery] = useState("");
  const r = useList(
    path,
    `q=${encodeURIComponent(query)}${path === "/products" ? "&status=active" : ""}`,
  );
  return (
    <div
      className={`api-picker ${path === "/products" ? "product-picker" : "party-picker"}`}
    >
      <label>
        {label}
        <input
          className="control"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            r.setPage(1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const found =
                r.data?.items.find(
                  (item) => text(item.barcode) === query.trim(),
                ) || (r.data?.total === 1 ? r.data.items[0] : undefined);
              if (found) onPick(found as T);
            }
          }}
          placeholder="ابحث بالاسم أو الباركود…"
        />
      </label>
      <Status {...r} />
      {r.data && (
        <>
          <div className="picker-results">
            {r.data.items.map((item) => (
              <button
                type="button"
                className="picker-option"
                key={item.id}
                onClick={() => onPick(item as T)}
              >
                {display ? display(item as T) : text(item.name)}
                <Plus size={16} />
              </button>
            ))}
          </div>
          {!r.data.total && <p className="muted">لا توجد نتائج.</p>}
          {r.data.total > 20 && (
            <Pager page={r.page} total={r.data.total} setPage={r.setPage} />
          )}
        </>
      )}
    </div>
  );
}
export function Overview() {
  const financial = useCan("Owner", "Accountant");
  const cashier = useCan("Cashier");
  const summary = useData<Row>(
    financial ? `/reports/summary?from=${today()}&to=${today()}` : null,
  );
  const low = useData<Page<Product>>("/products?status=low&pageSize=5");
  return (
    <>
      <Heading title="نظرة عامة">
        {useCan("Owner", "Cashier") && (
          <Link className="button primary" to="/pos">
            بيع جديد
          </Link>
        )}
      </Heading>
      {financial && (
        <>
          <Status {...summary} />
          {summary.data && (
            <section className="stats-grid">
              {[
                ["مبيعات اليوم", "salesCents"],
                ["صافي المشتريات", "purchasesCents"],
                ["مرتجعات الشراء", "purchaseReturnsCents"],
                ["المصروفات", "expensesCents"],
                ["الربح الإجمالي", "grossProfitCents"],
              ].map(([label, key]) => (
                <article className="stat-card" key={key}>
                  <p>{label}</p>
                  <strong className="stat-value">
                    {money(summary.data![key])}
                  </strong>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      <section className="panel">
        <h2>منتجات تحتاج متابعة</h2>
        <Status {...low} />
        {low.data && (
          <>
            <p className="muted">
              {low.data.total} منتجات وصلت إلى حد التنبيه.
            </p>
            <Table
              rows={low.data.items}
              columns={[
                named("المنتج", "name"),
                named("الرصيد", "stock"),
                named("حد التنبيه", "minimum"),
              ]}
            />
            <Link className="text-link" to="/products">
              عرض المنتجات
            </Link>
          </>
        )}
      </section>
      {cashier && (
        <p className="muted section-gap">
          سجّل البيع من نقطة البيع وراجع الفواتير من صفحة المبيعات.
        </p>
      )}
    </>
  );
}
export function Products() {
  const manage = useCan("Owner");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const r = useList(
    "/products",
    `q=${encodeURIComponent(query)}&status=${status}`,
  );
  const fields = (p?: Row): Field[] => [
    { key: "name", label: "اسم المنتج", value: p?.name },
    { key: "barcode", label: "الباركود", value: p?.barcode, optional: true },
    { key: "category", label: "الفئة", value: p?.category },
    {
      key: "unit",
      label: "الوحدة",
      type: "select",
      value: p?.unit || "قطعة",
      options: ["قطعة", "عبوة", "كيس", "كغم", "لتر"].map((value) => ({
        value,
        label: value,
      })),
    },
    {
      key: "salePriceCents",
      label: "سعر البيع — ₪",
      type: "money",
      value: p?.salePriceCents ?? 0,
      min: 0,
    },
    {
      key: "minimum",
      label: "حد التنبيه",
      type: "number",
      value: p?.minimum ?? 0,
      min: 0,
      step: 0.001,
    },
    {
      key: "cartonSize",
      label: "عدد الوحدات في الكرتونة",
      type: "number",
      value: p?.cartonSize ?? 1,
      min: 1,
      max: 100000,
    },
  ];
  const columns: Column[] = [
    named("المنتج", "name"),
    named("الباركود", "barcode"),
    named("الفئة", "category"),
    named("الوحدة", "unit"),
    priced("سعر البيع", "salePriceCents"),
    named("الرصيد", "stock"),
    {
      label: "الحالة",
      render: (p) =>
        p.archived
          ? "مؤرشف"
          : number(p.stock) <= number(p.minimum)
            ? "مخزون منخفض"
            : "نشط",
    },
  ];
  if (manage)
    columns.push({
      label: "الإجراءات",
      render: (p) => (
        <div className="actions">
          <EditButton
            label="تعديل"
            title="تعديل المنتج"
            fields={fields(p)}
            onSave={(v, c) =>
              c.run(
                `/products/${p.id}`,
                { ...v, version: p.version, archived: p.archived },
                "PATCH",
              )
            }
          />
          <Action
            label={p.archived ? "استعادة" : "أرشفة"}
            path={`/products/${p.id}`}
            method="PATCH"
            body={{ version: p.version, archived: !p.archived }}
            confirmText="تغيير حالة المنتج؟ الفواتير السابقة ستبقى محفوظة."
          />
          <EditButton
            label="رصيد افتتاحي"
            title={`رصيد افتتاحي: ${text(p.name)}`}
            fields={[
              {
                key: "quantity",
                label: "الكمية",
                type: "number",
                min: p.unit === "كغم" ? 0.001 : 1,
                step: p.unit === "كغم" ? 0.001 : 1,
              },
              {
                key: "unitCostCents",
                label: "تكلفة الوحدة — ₪",
                type: "money",
                min: 0,
              },
              { key: "reason", label: "البيان" },
            ]}
            onSave={(v, c) =>
              c.run("/stock/openings", { ...v, productId: p.id })
            }
          >
            <p className="muted">
              قبل أول حركة للمنتج فقط. لا يغيّر الصندوق أو ديون الموردين.
            </p>
          </EditButton>
        </div>
      ),
    });
  return (
    <>
      <Heading title="المنتجات">
        {manage && (
          <EditButton
            title="إضافة منتج"
            fields={fields()}
            onSave={(v, c) => c.run("/products", v)}
          />
        )}
      </Heading>
      <section className="panel">
        <div className="sales-toolbar">
          <input
            aria-label="بحث المنتجات"
            className="control grow"
            placeholder="اسم المنتج أو الباركود…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              r.setPage(1);
            }}
          />
          <select
            aria-label="حالة المنتج"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              r.setPage(1);
            }}
          >
            {[
              ["active", "النشطة"],
              ["all", "الكل"],
              ["low", "مخزون منخفض"],
              ["archived", "المؤرشفة"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Status {...r} />
        {r.data && (
          <>
            <Table rows={r.data.items} columns={columns} />
            <Pager page={r.page} total={r.data.total} setPage={r.setPage} />
          </>
        )}
      </section>
    </>
  );
}
export function Parties({ kind }: { kind: "customers" | "suppliers" }) {
  const customer = kind === "customers";
  const canCreate = useCan("Owner", customer ? "Cashier" : "Warehouse");
  const canPay = useCan("Owner", ...(customer ? ["Cashier"] : []));
  const [query, setQuery] = useState("");
  const r = useList("/" + kind, "q=" + encodeURIComponent(query));
  const [selected, setSelected] = useState<Row | null>(null);
  return (
    <>
      <Heading title={customer ? "الزبائن والديون" : "الموردون"}>
        {canCreate && (
          <EditButton
            title={customer ? "إضافة زبون" : "إضافة مورد"}
            fields={[
              { key: "name", label: "الاسم" },
              { key: "phone", label: "الهاتف", type: "tel", optional: true },
            ]}
            onSave={(v, c) => c.run("/" + kind, v)}
          />
        )}
      </Heading>
      <section className="panel">
        <input
          className="control"
          aria-label="البحث"
          placeholder="ابحث بالاسم أو الهاتف…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            r.setPage(1);
          }}
        />
        <Status {...r} />
        {r.data && (
          <>
            <Table
              rows={r.data.items}
              columns={[
                named("الاسم", "name"),
                named("الهاتف", "phone"),
                priced("المستحق", "balanceCents"),
                {
                  label: "الإجراءات",
                  render: (p) => (
                    <div className="actions">
                      <button
                        className="button soft"
                        onClick={() => setSelected(p)}
                      >
                        كشف حساب
                      </button>
                      {canPay && (
                        <EditButton
                          label="تسديد"
                          title={`تسديد ${text(p.name)}`}
                          disabled={number(p.balanceCents) <= 0}
                          fields={[
                            {
                              key: "amountCents",
                              label: "المبلغ — ₪",
                              type: "money",
                              min: 0.01,
                              max: number(p.balanceCents) / 100,
                            },
                            { key: "note", label: "ملاحظة", optional: true },
                          ]}
                          onSave={(v, c) =>
                            c.run(`/${kind}/${p.id}/payments`, v)
                          }
                        >
                          <p className="muted">
                            المستحق {money(p.balanceCents)}. التسديد مرتبط
                            بالصندوق.
                          </p>
                        </EditButton>
                      )}
                    </div>
                  ),
                },
              ]}
            />
            <Pager page={r.page} total={r.data.total} setPage={r.setPage} />
          </>
        )}
      </section>
      {selected && (
        <Statement
          key={selected.id}
          path={`/${kind}/${selected.id}/statement`}
          name={text(selected.name)}
          close={() => setSelected(null)}
        />
      )}
    </>
  );
}
function Statement({
  path,
  name,
  close,
}: {
  path: string;
  name: string;
  close: () => void;
}) {
  return (
    <section className="section-gap">
      <Heading title={`كشف حساب: ${name}`}>
        <button className="button soft" onClick={close}>
          إغلاق الكشف
        </button>
      </Heading>
      <ListPanel
        path={path}
        columns={[
          dated,
          {
            label: "الحركة",
            render: (r) => kinds[text(r.kind)] || text(r.kind),
          },
          priced("المبلغ", "amountCents"),
          named("البيان", "note"),
        ]}
      />
    </section>
  );
}
export function Invoices({ purchase = false }: { purchase?: boolean }) {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [method, setMethod] = useState("");
  const [detailTab, setDetailTab] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const path = purchase ? "/purchases" : "/sales";
  const detail = useData<Invoice>(selected ? path + "/" + selected : null);
  const create = useCan("Owner", purchase ? "Warehouse" : "Cashier");
  return (
    <>
      <Heading title={purchase ? "المشتريات" : "المبيعات"}>
        {create && (
          <Link
            className="button primary"
            to={purchase ? "/purchase/new" : "/pos"}
          >
            فاتورة جديدة
          </Link>
        )}
      </Heading>
      <div className="panel sales-toolbar">
        <input
          className="control grow"
          placeholder="رقم الفاتورة أو اسم الطرف…"
          aria-label="بحث الفواتير"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label>
          من تاريخ
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          إلى تاريخ
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {!purchase && (
          <select
            aria-label="طريقة الدفع"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="">كل طرق الدفع</option>
            {Object.entries(methods).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        )}
      </div>
      {from && to && from > to ? (
        <p role="alert">راجع نطاق التواريخ.</p>
      ) : (
        <ListPanel
          key={`${query}-${from}-${to}-${method}`}
          path={path}
          query={new URLSearchParams({
            q: query,
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            ...(method ? { method } : {}),
          }).toString()}
          columns={[
            named("الفاتورة", "number"),
            named("التاريخ", "date"),
            named(purchase ? "المورد" : "الزبون", "partyName"),
            priced("الإجمالي", "totalCents"),
            priced("المدفوع", "paidCents"),
            priced("المتبقي", "outstandingCents"),
            {
              label: "عرض",
              render: (r) => (
                <button
                  className="button soft"
                  onClick={() => {
                    setSelected(r.id);
                    setDetailTab(0);
                  }}
                >
                  التفاصيل / طباعة
                </button>
              ),
            },
          ]}
        />
      )}{" "}
      {selected && (
        <>
          <Status {...detail} />
          {detail.data && (
            <InvoiceDetails
              key={detail.data.id}
              invoice={detail.data}
              tab={detailTab}
              onTabChange={setDetailTab}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      )}
    </>
  );
}
type CartLine = {
  product: Product;
  quantity: number;
  factor: number;
  unitCost: string;
};
export function Checkout({ purchase = false }: { purchase?: boolean }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [party, setParty] = useState<Party | null>(null);
  const [method, setMethod] = useState("cash");
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<Invoice | null>(null);
  const [paper, setPaper] = useState<PaperWidth>(80);
  const [error, setError] = useState("");
  const c = useCommand();
  useEffect(() => {
    if (!cart.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [cart.length]);
  function add(p: Product) {
    if (c.busy) return;
    setReceipt(null);
    setCart((old) =>
      old.some((l) => l.product.id === p.id)
        ? old.map((l) =>
            l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [...old, { product: p, quantity: 1, factor: 1, unitCost: "" }],
    );
  }
  function change(id: string, patch: Partial<CartLine>) {
    setCart((old) =>
      old.map((l) => (l.product.id === id ? { ...l, ...patch } : l)),
    );
  }
  const subtotal = cart.reduce(
    (s, l) =>
      s +
      lineTotal(
        l.quantity,
        purchase ? previewCents(l.unitCost) : l.product.salePriceCents,
      ),
    0,
  );
  const discountCents = previewCents(discount);
  const total = Math.max(0, subtotal - discountCents);
  const received = previewCents(paid);
  async function save() {
    if (c.busy) return;
    setError("");
    if (!cart.length) {
      setError("أضف منتجًا إلى الفاتورة.");
      return;
    }
    if (purchase && !party) {
      setError("اختر المورد.");
      return;
    }
    if (
      cart.some(
        (l) =>
          !Number.isFinite(l.quantity) ||
          l.quantity <= 0 ||
          ((l.product.unit !== "كغم" || l.factor !== 1) &&
            !Number.isInteger(l.quantity)) ||
          (purchase && (l.unitCost === "" || Number(l.unitCost) < 0)),
      )
    ) {
      setError("راجع كمية وتكلفة كل صنف.");
      return;
    }
    if (
      cart.some((l) => !/^\d+(?:\.\d{1,3})?$/.test(String(l.quantity))) ||
      Number(discount) < 0 ||
      Number(paid) < 0 ||
      !Number.isFinite(Number(discount)) ||
      !Number.isFinite(Number(paid))
    ) {
      setError("راجع المبالغ ودقة الكميات.");
      return;
    }
    if (discountCents > subtotal) {
      setError("الخصم يتجاوز الإجمالي.");
      return;
    }
    try {
      cents(discount);
      cents(paid);
      if (purchase) cart.forEach((l) => cents(l.unitCost));
    } catch (e) {
      setError(e instanceof Error ? e.message : "راجع المبالغ.");
      return;
    }
    const body = purchase
      ? {
          supplierId: party!.id,
          date,
          lines: cart.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
            factor: l.factor,
            unitCostCents: cents(l.unitCost),
          })),
          discountCents,
          paidCents: received,
          notes,
        }
      : {
          customerId: party?.id || null,
          lines: cart.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
            unitPriceCents: l.product.salePriceCents,
          })),
          discountCents,
          method,
          receivedCents:
            method === "credit" || method === "card" ? 0 : received,
        };
    try {
      const result = await c.run<Invoice>(
        purchase ? "/purchases" : "/sales",
        body,
      );
      if (result) {
        setReceipt(result);
        setCart([]);
        setParty(null);
        setPaid("");
        setDiscount("0");
        setNotes("");
      }
    } catch {
      /* cart remains intact for retry */
    }
  }
  return (
    <>
      <Heading title={purchase ? "فاتورة شراء جديدة" : "نقطة البيع"} />
      <div
        className={`checkout-layout ${purchase ? "purchase-checkout" : "sale-checkout"}`}
      >
        <section className="panel checkout-catalog">
          <Picker<Product>
            path="/products"
            label="إضافة منتج"
            onPick={add}
            display={(p) =>
              `${p.name} · ${money(p.salePriceCents)} · الرصيد ${p.stock}`
            }
          />
          <fieldset
            disabled={c.busy}
            className="connected-fields checkout-party-fields"
          >
            <Picker<Party>
              path={purchase ? "/suppliers" : "/customers"}
              label={
                purchase ? "اختيار المورد" : "اختيار الزبون للآجل أو الجزئي"
              }
              onPick={setParty}
            />
            {party && (
              <div className="detail-row">
                <span>
                  {party.name} · المستحق {money(party.balanceCents)}
                </span>
                <button className="button soft" onClick={() => setParty(null)}>
                  إزالة الاختيار
                </button>
              </div>
            )}
          </fieldset>
        </section>
        <section className="panel">
          <div className="checkout-panel-heading">
            <h2>الفاتورة</h2>
            <span>{cart.length} صنف</span>
          </div>
          <fieldset disabled={c.busy} className="connected-fields">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الكمية</th>
                    {purchase && (
                      <>
                        <th>العبوة</th>
                        <th>تكلفة العبوة — ₪</th>
                      </>
                    )}
                    <th>المجموع</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((l) => (
                    <tr key={l.product.id}>
                      <td>
                        {l.product.name}
                        <small className="block muted">{l.product.unit}</small>
                      </td>
                      <td>
                        <input
                          aria-label={`كمية ${l.product.name}`}
                          type="number"
                          min={l.product.unit === "كغم" ? 0.001 : 1}
                          step={
                            l.product.unit === "كغم" && l.factor === 1
                              ? 0.001
                              : 1
                          }
                          value={l.quantity}
                          onChange={(e) =>
                            change(l.product.id, {
                              quantity: Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      {purchase && (
                        <>
                          <td>
                            <select
                              aria-label={`عبوة ${l.product.name}`}
                              value={l.factor}
                              onChange={(e) =>
                                change(l.product.id, {
                                  factor: Number(e.target.value),
                                })
                              }
                            >
                              <option value={1}>وحدة</option>
                              {l.product.cartonSize > 1 && (
                                <option value={l.product.cartonSize}>
                                  كرتونة ({l.product.cartonSize})
                                </option>
                              )}
                            </select>
                          </td>
                          <td>
                            <input
                              aria-label={`تكلفة ${l.product.name}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.unitCost}
                              onChange={(e) =>
                                change(l.product.id, {
                                  unitCost: e.target.value,
                                })
                              }
                            />
                          </td>
                        </>
                      )}
                      <td>
                        {money(
                          lineTotal(
                            l.quantity,
                            purchase
                              ? previewCents(l.unitCost)
                              : l.product.salePriceCents,
                          ),
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`حذف ${l.product.name}`}
                          onClick={() =>
                            setCart((old) =>
                              old.filter((x) => x.product.id !== l.product.id),
                            )
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!cart.length && (
              <p className="empty-message">أضف المنتجات لبدء الفاتورة.</p>
            )}
            <div className="form-grid">
              <label>
                الخصم — ₪
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </label>
              {purchase ? (
                <>
                  <label>
                    التاريخ
                    <input
                      type="date"
                      max={today()}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                  <label>
                    ملاحظات
                    <input
                      maxLength={500}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <label>
                  طريقة الدفع
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {Object.entries(methods).map(([v, l]) => (
                      <option value={v} key={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(purchase || ["cash", "partial"].includes(method)) && (
                <div className="checkout-paid-field">
                  <label>
                    {purchase ? "المدفوع نقدًا" : "المبلغ المستلم"} — ₪
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paid}
                      onChange={(e) => setPaid(e.target.value)}
                    />
                  </label>
                  {!purchase && method === "cash" && (
                    <button
                      type="button"
                      className="text-link amount-fill"
                      onClick={() => setPaid((total / 100).toFixed(2))}
                    >
                      المبلغ كاملًا
                    </button>
                  )}
                </div>
              )}
              {!purchase && (
                <label>
                  ورق الطابعة الحرارية
                  <select
                    aria-label="مقاس ورق فاتورة البيع"
                    value={paper}
                    onChange={(e) =>
                      setPaper(Number(e.target.value) as PaperWidth)
                    }
                  >
                    <option value={80}>80 مم</option>
                    <option value={58}>58 مم</option>
                  </select>
                </label>
              )}
            </div>
            <div className="checkout-totals">
              <div>
                <span>قبل الخصم</span>
                <strong>
                  <bdi>{money(subtotal)}</bdi>
                </strong>
              </div>
              <div>
                <span>الخصم</span>
                <strong>
                  <bdi>{money(discountCents)}</bdi>
                </strong>
              </div>
              <div className="checkout-grand-total">
                <span>الإجمالي</span>
                <strong>
                  <bdi>{money(total)}</bdi>
                </strong>
              </div>
              {!purchase && method === "cash" && received > total && (
                <div className="checkout-change">
                  <span>الباقي للزبون</span>
                  <strong>
                    <bdi>{money(received - total)}</bdi>
                  </strong>
                </div>
              )}
            </div>
            {(error || c.error) && (
              <p className="customer-error" role="alert">
                {error || c.error}
              </p>
            )}
            <button
              className="button primary checkout-submit"
              disabled={c.busy || !cart.length}
              onClick={() => void save()}
            >
              <Check size={17} />
              {c.busy ? "جارٍ تسجيل الفاتورة…" : "حفظ الفاتورة"}
            </button>
          </fieldset>
        </section>
      </div>
      {receipt && (
        <InvoiceView
          invoice={receipt}
          autoPrint={!purchase && receipt.kind === "sale"}
          paper={paper}
          onPaperChange={setPaper}
        />
      )}
    </>
  );
}
export function Expenses() {
  const can = useCan("Owner");
  return (
    <>
      <Heading title="المصروفات">
        {can && (
          <EditButton
            title="إضافة مصروف"
            fields={[
              { key: "description", label: "البيان" },
              { key: "category", label: "الفئة" },
              {
                key: "amountCents",
                label: "المبلغ — ₪",
                type: "money",
                min: 0.01,
              },
              {
                key: "date",
                label: "التاريخ",
                type: "date",
                value: today(),
                max: today(),
              },
            ]}
            onSave={(v, c) => c.run("/expenses", v)}
          />
        )}
      </Heading>
      <ListPanel
        path="/expenses"
        columns={[
          named("الرقم", "number"),
          named("التاريخ", "date"),
          named("البيان", "description"),
          named("الفئة", "category"),
          priced("المبلغ", "amountCents"),
          {
            label: "الحالة",
            render: (r) =>
              r.cancelled ? `ملغى: ${text(r.cancellationReason)}` : "مسجل",
          },
          ...(can
            ? [
                {
                  label: "الإجراء",
                  render: (r: Row) =>
                    !r.cancelled && (
                      <EditButton
                        label="إلغاء المصروف"
                        title="إلغاء بقيد عكس في الصندوق"
                        fields={[{ key: "reason", label: "سبب الإلغاء" }]}
                        onSave={(v, c) => c.run(`/expenses/${r.id}/cancel`, v)}
                      />
                    ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
export function Cashbox() {
  const can = useCan("Owner");
  const s = useData<Row>("/cash/summary");
  return (
    <>
      <Heading title="الصندوق">
        {can && (
          <EditButton
            title="حركة نقد يدوية"
            fields={[
              {
                key: "direction",
                label: "الاتجاه",
                type: "select",
                options: [
                  { value: "in", label: "إيداع" },
                  { value: "out", label: "سحب" },
                ],
              },
              {
                key: "amountCents",
                label: "المبلغ — ₪",
                type: "money",
                min: 0.01,
              },
              { key: "description", label: "البيان" },
            ]}
            onSave={(v, c) => c.run("/cash/entries", v)}
          />
        )}
      </Heading>
      <Status {...s} />
      {s.data && (
        <>
          <section className="stats-grid">
            {[
              ["المقبوضات", "incomingCents"],
              ["المدفوعات", "outgoingCents"],
              ["الرصيد المتوقع", "balanceCents"],
            ].map(([label, key]) => (
              <article className="stat-card" key={key}>
                <p>{label}</p>
                <strong className="stat-value">{money(s.data![key])}</strong>
              </article>
            ))}
          </section>
          {can && (
            <EditButton
              label="مطابقة الصندوق"
              title="مطابقة النقد الفعلي"
              fields={[
                {
                  key: "actualCents",
                  label: "النقد الفعلي — ₪",
                  type: "money",
                  min: 0,
                },
                {
                  key: "note",
                  label: "تفسير الفرق / الملاحظة",
                  optional: true,
                },
              ]}
              onSave={(v, c) =>
                c.run("/cash/reconciliations", {
                  ...v,
                  revision: s.data!.revision,
                })
              }
            >
              <p className="muted">
                المتوقع {money(s.data.balanceCents)}. المطابقة تحفظ الفرق ولا
                تسويه تلقائيًا.
              </p>
            </EditButton>
          )}
        </>
      )}
      <section className="section-gap">
        <h2>الحركات النقدية</h2>
        <ListPanel
          path="/cash/entries"
          columns={[
            dated,
            {
              label: "النوع",
              render: (r) => kinds[text(r.kind)] || text(r.kind),
            },
            named("البيان", "description"),
            priced("المبلغ", "amountCents"),
          ]}
        />
      </section>
      <section className="section-gap">
        <h2>آخر 100 مطابقة</h2>
        <ItemList
          path="/cash/reconciliations"
          columns={[
            dated,
            priced("المتوقع", "expectedCents"),
            priced("الفعلي", "actualCents"),
            priced("الفرق", "differenceCents"),
            named("البيان", "note"),
          ]}
        />
      </section>
    </>
  );
}
export function Stocktake() {
  const can = useCan("Owner", "Warehouse");
  const [p, setP] = useState<Product | null>(null);
  return (
    <>
      <Heading title="الجرد والتسويات" />
      {can && (
        <section className="panel">
          <Picker<Product>
            key={p ? "chosen" : "select"}
            path="/products"
            label="اختر الصنف للجرد"
            onPick={setP}
          />
          {p && (
            <div key={p.id} className="section-gap">
              <p>
                {p.name} · الرصيد المقروء {p.stock} {p.unit}
              </p>
              <EditButton
                label="تسجيل الجرد"
                title={`جرد ${p.name}`}
                fields={[
                  {
                    key: "actual",
                    label: "الكمية الفعلية",
                    type: "number",
                    value: p.stock,
                    min: 0,
                    step: p.unit === "كغم" ? 0.001 : 1,
                  },
                  { key: "reason", label: "سبب الفرق" },
                ]}
                onSave={async (v, c) => {
                  await c.run("/stock/adjustments", {
                    ...v,
                    productId: p.id,
                    expected: p.stock,
                  });
                  setP(null);
                }}
              />
              <button className="button soft" onClick={() => setP(null)}>
                إعادة اختيار الصنف
              </button>
            </div>
          )}
        </section>
      )}
      <section className="section-gap">
        <h2>حركة المخزون</h2>
        <ListPanel
          path="/stock/movements"
          columns={[
            dated,
            named("معرّف المنتج", "productId"),
            {
              label: "الحركة",
              render: (r) => kinds[text(r.kind)] || text(r.kind),
            },
            named("التغير", "quantity"),
            named("الرصيد بعد الحركة", "balanceAfter"),
            priced("تكلفة الوحدة", "unitCostCents"),
            named("البيان", "reason"),
          ]}
        />
      </section>
    </>
  );
}
export function Reports() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const invalid = from > to;
  const s = useData<Row>(
    invalid ? null : `/reports/summary?from=${from}&to=${to}`,
  );
  const d = useData<{ items: Row[] }>(
    invalid ? null : `/reports/daily-sales?from=${from}&to=${to}`,
  );
  return (
    <>
      <Heading title="التقارير" />
      <section className="panel sales-toolbar">
        <label>
          من
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          إلى
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="button soft" onClick={() => window.print()}>
          <Printer size={16} />
          طباعة التقرير
        </button>
      </section>
      {invalid ? (
        <p role="alert">تاريخ البداية يجب أن يسبق النهاية.</p>
      ) : (
        <>
          <Status {...s} />
          {s.data && (
            <section className="stats-grid">
              {[
                ["صافي المبيعات", "salesCents"],
                ["مرتجعات البيع", "saleReturnsCents"],
                ["صافي المشتريات", "purchasesCents"],
                ["مرتجعات الشراء", "purchaseReturnsCents"],
                ["المصروفات الصافية", "expensesCents"],
                ["تكلفة البضاعة المسجلة", "recordedCostOfGoodsCents"],
                ["الربح الإجمالي", "grossProfitCents"],
                ["قيمة تسويات المخزون", "inventoryAdjustmentValueCents"],
                ["فرق تكلفة مرتجعات الشراء", "purchaseReturnVarianceCents"],
                ["الربح التشغيلي", "operatingProfitCents"],
              ].map(([label, key]) => (
                <article className="stat-card" key={key}>
                  <p>{label}</p>
                  <strong className="stat-value">{money(s.data![key])}</strong>
                </article>
              ))}
            </section>
          )}
          {s.data &&
            (number(s.data.uncostedInvoices) > 0 ||
              number(s.data.uncostedReturns) > 0) && (
              <p className="warning-state">
                بعض الفواتير أو المرتجعات بتكلفة غير مكتملة؛ لا يعرض ربح مؤكد.
              </p>
            )}
          <section className="panel">
            <h2>المبيعات اليومية</h2>
            <Status {...d} />
            {d.data && (
              <Table
                rows={d.data.items.map((x) => ({ ...x, id: text(x.date) }))}
                columns={[
                  named("اليوم", "date"),
                  priced("صافي المبيعات", "totalCents"),
                  priced("مرتجعات البيع", "returnCents"),
                  named("عدد الفواتير", "count"),
                  named("عدد المرتجعات", "returnCount"),
                ]}
              />
            )}
          </section>
        </>
      )}
    </>
  );
}
export function Employees() {
  return (
    <>
      <Heading title="الموظفون">
        <EditButton
          title="إضافة موظف"
          fields={[
            { key: "name", label: "الاسم" },
            {
              key: "phone",
              label: "الهاتف",
              type: "tel",
              pattern: "0(59|56)[0-9]{7}",
            },
            {
              key: "role",
              label: "الدور",
              type: "select",
              options: roleOptions(["Cashier", "Warehouse", "Accountant"]),
            },
          ]}
          onSave={(v, c) =>
            c.run("/employees", { ...v, email: "", active: true })
          }
        />
      </Heading>
      <ItemList
        path="/employees"
        columns={[
          named("الاسم", "name"),
          named("الهاتف", "phone"),
          { label: "الدور", render: (r) => roles[text(r.role)] },
          { label: "الحالة", render: (r) => (r.active ? "نشط" : "معطّل") },
          {
            label: "الإجراءات",
            render: (r) =>
              r.role === "Owner" ? null : (
                <div className="actions">
                  <EditButton
                    label="تعديل"
                    title="تعديل الموظف"
                    fields={[
                      { key: "name", label: "الاسم", value: r.name },
                      {
                        key: "role",
                        label: "الدور",
                        type: "select",
                        value: r.role,
                        options: roleOptions([
                          "Cashier",
                          "Warehouse",
                          "Accountant",
                        ]),
                      },
                      {
                        key: "active",
                        label: "نشط",
                        type: "checkbox",
                        value: r.active,
                      },
                    ]}
                    onSave={(v, c) => c.run(`/employees/${r.id}`, v, "PATCH")}
                  />
                </div>
              ),
          },
        ]}
      />
    </>
  );
}
export function Devices({ admin = false }: { admin?: boolean }) {
  const [shop, setShop] = useState("");
  return (
    <>
      <Heading title="الأجهزة والجلسات" />
      {admin && (
        <section className="panel">
          <Picker<Row>
            path="/admin/shops"
            label="تصفية بالبقالة"
            onPick={(r) => setShop(r.id)}
          />
          {shop && (
            <button className="button soft" onClick={() => setShop("")}>
              عرض كل البقالات
            </button>
          )}
        </section>
      )}
      <p className="muted">
        سحب الجلسة يمنع استخدامها. الدخول مجددًا يحتاج التحقق من الحساب.
      </p>
      <ItemList
        path={
          admin
            ? "/admin/devices" + (shop ? "?shopId=" + shop : "")
            : "/devices"
        }
        columns={[
          named("الجهاز", "deviceName"),
          ...(admin ? [named("معرّف البقالة", "shopId")] : []),
          { label: "آخر ظهور", render: (r) => dateTime(r.lastSeen) },
          { label: "انتهاء الجلسة", render: (r) => dateTime(r.expiresAt) },
          { label: "الحالة", render: (r) => (r.active ? "نشطة" : "مسحوبة") },
          {
            label: "الإجراء",
            render: (r) => (
              <Action
                disabled={!r.active}
                label="سحب الجلسة"
                path={`${admin ? "/admin" : ""}/devices/${r.id}/revoke`}
                confirmText="سحب هذه الجلسة؟"
              />
            ),
          },
        ]}
      />
    </>
  );
}
export function Support({ admin = false }: { admin?: boolean }) {
  const [status, setStatus] = useState("");
  const r = useData<{ items: Row[] }>(
    `${admin ? "/admin" : ""}/support/tickets${admin && status ? "?status=" + status : ""}`,
  );
  return (
    <>
      <Heading title="الدعم الفني">
        {!admin && (
          <EditButton
            title="طلب دعم جديد"
            fields={[
              { key: "subject", label: "العنوان" },
              { key: "message", label: "التفاصيل", type: "textarea" },
            ]}
            onSave={(v, c) => c.run("/support/tickets", v)}
          />
        )}
      </Heading>
      {admin && (
        <select
          aria-label="حالة الطلب"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">كل الحالات</option>
          <option value="open">مفتوحة</option>
          <option value="closed">مغلقة</option>
        </select>
      )}
      <Status {...r} />
      {r.data && !r.data.items.length && (
        <p className="empty-message">لا توجد طلبات دعم.</p>
      )}
      {r.data?.items.map((t) => (
        <article className="panel section-gap" key={t.id}>
          <h2>{text(t.subject)}</h2>
          <p className="muted">
            {dateTime(t.date)} · {t.status === "open" ? "مفتوحة" : "مغلقة"}
            {admin && ` · البقالة ${text(t.shopId)}`}
          </p>
          <p className="body-copy">{text(t.message)}</p>
          {!!t.reply && (
            <blockquote className="body-copy">{text(t.reply)}</blockquote>
          )}
          {admin && (
            <EditButton
              label="الرد وتغيير الحالة"
              title="الرد على طلب الدعم"
              fields={[
                {
                  key: "reply",
                  label: "الرد",
                  type: "textarea",
                  value: t.reply,
                },
                {
                  key: "status",
                  label: "الحالة",
                  type: "select",
                  value: t.status,
                  options: [
                    { value: "open", label: "مفتوحة" },
                    { value: "closed", label: "مغلقة" },
                  ],
                },
              ]}
              onSave={(v, c) =>
                c.run(`/admin/support/tickets/${t.id}`, v, "PATCH")
              }
            />
          )}
        </article>
      ))}
    </>
  );
}
export function Settings() {
  const can = useCan("Owner");
  const s = useData<Row>("/settings");
  return (
    <>
      <Heading title="إعدادات المحل" />
      <Status {...s} />
      {s.data &&
        (can ? (
          <SettingsForm
            path="/settings"
            fields={[
              { key: "name", label: "اسم البقالة", value: s.data.name },
              { key: "owner", label: "اسم المالك", value: s.data.owner },
              {
                key: "phone",
                label: "هاتف التواصل",
                type: "tel",
                value: s.data.phone,
                pattern: "0(59|56)[0-9]{7}",
              },
              {
                key: "address",
                label: "العنوان",
                value: s.data.address,
                optional: true,
              },
              {
                key: "receiptNote",
                label: "ملاحظة الإيصال",
                value: s.data.receiptNote,
                optional: true,
              },
            ]}
          />
        ) : (
          <section className="panel">
            <h2>{text(s.data.name)}</h2>
            <p>{text(s.data.address)}</p>
            <p>{text(s.data.phone)}</p>
          </section>
        ))}
    </>
  );
}
export function Audit({ admin = false }: { admin?: boolean }) {
  return (
    <>
      <Heading title="سجل العمليات" />
      <ListPanel
        path={admin ? "/admin/audit" : "/audit"}
        columns={[
          dated,
          named("معرّف المستخدم", "userId"),
          named("العملية", "action"),
          ...(admin ? [named("معرّف البقالة", "shopId")] : []),
        ]}
      />
    </>
  );
}
