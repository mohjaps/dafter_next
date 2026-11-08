"use client";
import { useState, useRef, useId } from "react";
import { RotateCcw, X } from "lucide-react";
import { useCommand, useData } from "./data";
import { useSession } from "./auth";
import { Status } from "./ui";
import { InvoiceView } from "./invoice";
import { returnAmount } from "./returnMoney";
import type { Invoice, InvoiceLine } from "./types";
import { money, dateTime } from "./types";

type ReturnLine = {
  productId: string;
  name: string;
  unit: string;
  factor: number;
  quantity: number;
  unitPriceCents: number;
  netCents: number;
  returnedQuantity: number;
  remainingQuantity: number;
};
type ReturnEntry = {
  id: string;
  number: string;
  kind: string;
  invoiceId: string;
  date: string;
  createdAt: string;
  totalCents: number;
  debtReductionCents: number;
  cashCents: number;
  cardCents: number;
  refundMethod: string;
  reason: string;
  costCents: number | null;
  costComplete: boolean;
  lines: (InvoiceLine & { costCents: number | null })[];
};
type ReturnSummary = {
  invoiceId: string;
  originalNumber: string;
  revision: string;
  partyBalanceCents: number;
  returnedCents: number;
  remainingCents: number;
  lines: ReturnLine[];
  items: ReturnEntry[];
};
export function ReturnPanel({ invoice }: { invoice: Invoice }) {
  const purchase = invoice.kind === "purchase";
  const session = useSession();
  const canCreate = session.me!.roles.some(
    (r) => r === "Owner" || r === (purchase ? "Warehouse" : "Cashier"),
  );
  const path = `/${purchase ? "purchases" : "sales"}/${invoice.id}/returns`;
  const summary = useData<ReturnSummary>(path);
  return (
    <section className="panel section-gap return-panel">
      <h2>
        <RotateCcw size={18} /> مرتجعات الفاتورة
      </h2>
      <Status {...summary} />
      {summary.data && (
        <>
          <div className="return-overview">
            <div>
              <span>إجمالي المرتجعات</span>
              <strong>{money(summary.data.returnedCents)}</strong>
            </div>
            <div>
              <span>صافي الفاتورة بعد المرتجعات</span>
              <strong>{money(summary.data.remainingCents)}</strong>
            </div>
            <div>
              <span>رصيد دين {purchase ? "المورد" : "الزبون"} الحالي</span>
              <strong>{money(summary.data.partyBalanceCents)}</strong>
            </div>
          </div>
          {canCreate &&
            summary.data.lines.some((l) => l.remainingQuantity > 0) && (
              <ReturnForm
                key={summary.data.revision}
                invoice={invoice}
                summary={summary.data}
                path={path}
              />
            )}
          {!summary.data.lines.some((l) => l.remainingQuantity > 0) && (
            <p className="return-complete">
              <RotateCcw size={16} /> تم إرجاع جميع أصناف الفاتورة.
            </p>
          )}
          <ReturnHistory invoice={invoice} entries={summary.data.items} />
        </>
      )}
    </section>
  );
}
function ReturnForm({
  invoice,
  summary,
  path,
}: {
  invoice: Invoice;
  summary: ReturnSummary;
  path: string;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [method, setMethod] = useState(
    invoice.method === "card" ? "card" : "cash",
  );
  const [reason, setReason] = useState("");
  const [cardConfirmed, setCardConfirmed] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const command = useCommand();
  const purchase = invoice.kind === "purchase";
  function amount(line: ReturnLine) {
    try {
      return returnAmount(
        line.netCents,
        line.quantity,
        line.returnedQuantity,
        Number(quantities[line.productId] || 0),
      );
    } catch {
      return 0;
    }
  }
  const total = summary.lines.reduce((sum, line) => sum + amount(line), 0);
  const debt = Math.min(total, Math.max(0, summary.partyBalanceCents));
  const refund = total - debt;
  async function save() {
    setError("");
    const selected = summary.lines.filter(
      (l) => quantities[l.productId] && Number(quantities[l.productId]) !== 0,
    );
    if (!selected.length) {
      setError("اختر صنفًا واحدًا على الأقل.");
      return;
    }
    for (const line of selected) {
      const raw = quantities[line.productId];
      const quantity = Number(raw);
      if (
        !/^\d+(?:\.\d{1,3})?$/.test(raw) ||
        quantity <= 0 ||
        quantity > line.remainingQuantity ||
        ((line.unit !== "كغم" || line.factor !== 1) &&
          !Number.isInteger(quantity))
      ) {
        setError("راجع كميات المرتجع؛ لا تتجاوز المتبقي من الفاتورة.");
        return;
      }
    }
    if (!reason.trim()) {
      setError("اكتب سبب الإرجاع.");
      return;
    }
    if (method === "card" && refund > 0 && !cardConfirmed) {
      setError("أكد تنفيذ استرداد البطاقة خارج النظام.");
      return;
    }
    try {
      await command.run(path, {
        lines: selected.map((l) => ({
          productId: l.productId,
          quantity: Number(quantities[l.productId]),
        })),
        reason: reason.trim(),
        refundMethod: method,
        revision: summary.revision,
      });
    } catch {
      /* Preserve selection and idempotency key on failure. */
    }
  }
  return (
    <div className="return-editor no-print">
      <button
        className="button primary"
        onClick={() => dialogRef.current?.showModal()}
      >
        <RotateCcw size={16} /> تسجيل مرتجع
      </button>
      <dialog
        className="return-dialog"
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(e) => {
          if (command.busy) e.preventDefault();
        }}
      >
        <header className="return-dialog-header">
          <div>
            <span>
              الفاتورة <bdi>{invoice.number}</bdi>
            </span>
            <h2 id={titleId}>
              {purchase ? "إرجاع للمورد" : "إرجاع من الزبون"}
            </h2>
          </div>
          <button
            className="button soft"
            aria-label="إغلاق نافذة المرتجع"
            disabled={command.busy}
            onClick={() => dialogRef.current?.close()}
          >
            <X size={18} />
          </button>
        </header>
        <fieldset disabled={command.busy}>
          <div className="actions">
            <button
              type="button"
              className="button soft"
              onClick={() =>
                setQuantities(
                  Object.fromEntries(
                    summary.lines.map((l) => [
                      l.productId,
                      String(l.remainingQuantity),
                    ]),
                  ),
                )
              }
            >
              إرجاع كامل المتبقي
            </button>
            <button
              type="button"
              className="button soft"
              onClick={() => setQuantities({})}
            >
              مسح الاختيار
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الأصلي</th>
                  <th>أُرجع سابقًا</th>
                  <th>المتاح للإرجاع</th>
                  <th>كمية المرتجع</th>
                  <th>القيمة بعد الخصم</th>
                </tr>
              </thead>
              <tbody>
                {summary.lines.map((line) => (
                  <tr key={line.productId}>
                    <td>
                      {line.name}
                      <small>
                        {" "}
                        · {line.unit}
                        {line.factor > 1 ? ` (${line.factor} وحدة)` : ""}
                      </small>
                    </td>
                    <td>{line.quantity}</td>
                    <td>{line.returnedQuantity}</td>
                    <td>{line.remainingQuantity}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max={line.remainingQuantity}
                        step={
                          line.unit === "كغم" && line.factor === 1
                            ? "0.001"
                            : "1"
                        }
                        disabled={!line.remainingQuantity}
                        aria-label={`كمية مرتجع ${line.name}`}
                        value={quantities[line.productId] ?? ""}
                        onChange={(e) =>
                          setQuantities((old) => ({
                            ...old,
                            [line.productId]: e.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>{money(amount(line))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            القيمة محسوبة بسعر الفاتورة وخصمها الأصليين. ينخفض رصيد دين{" "}
            {purchase ? "المورد" : "الزبون"} الحالي أولًا، وأي مبلغ متبقٍ تتم
            تسويته بالطريقة المختارة.
          </p>
          <div className="form-grid">
            <label>
              سبب الإرجاع
              <textarea
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label>
              طريقة تسوية المبلغ المتبقي
              <select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  setCardConfirmed(false);
                }}
              >
                <option value="cash">نقدي</option>
                <option value="card">بطاقة — تسجيل استرداد خارجي</option>
              </select>
            </label>
          </div>
          <div className="receipt-totals">
            <strong>قيمة المرتجع: {money(total)}</strong>
            <p>تخفيض الدين: {money(debt)}</p>
            <p>
              {purchase ? "المبلغ المسترد من المورد" : "المبلغ المعاد للزبون"}:{" "}
              {money(refund)}
            </p>
          </div>
          {method === "card" && refund > 0 && (
            <label>
              <input
                type="checkbox"
                checked={cardConfirmed}
                onChange={(e) => setCardConfirmed(e.target.checked)}
              />{" "}
              تم تنفيذ استرداد البطاقة خارج النظام؛ هذا التسجيل لا يُجري تحويلًا
              إلكترونيًا.
            </label>
          )}
          {(error || command.error) && (
            <p className="customer-error" role="alert">
              {error || command.error}
            </p>
          )}
          <div className="actions">
            <button
              className="button primary"
              disabled={command.busy}
              onClick={() => void save()}
            >
              {command.busy ? "جارٍ تسجيل المرتجع…" : "تأكيد المرتجع"}
            </button>
            <button
              className="button soft"
              disabled={command.busy}
              onClick={() => dialogRef.current?.close()}
            >
              إغلاق
            </button>
          </div>
        </fieldset>
      </dialog>
    </div>
  );
}
function ReturnHistory({
  invoice,
  entries,
}: {
  invoice: Invoice;
  entries: ReturnEntry[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const entry = entries.find((r) => r.id === selected);
  const receipt: Invoice | null = entry
    ? {
        ...entry,
        originalNumber: invoice.number,
        partyName: invoice.partyName,
        subtotalCents: entry.totalCents,
        discountCents: 0,
        paidCents: entry.cashCents + entry.cardCents,
        outstandingCents: entry.debtReductionCents,
        changeCents: 0,
        method: entry.refundMethod,
        notes: entry.reason,
        lines: entry.lines.map((l) => ({ ...l, unitCostCents: null })),
      }
    : null;
  return (
    <div className="return-history section-gap">
      <h3>سجل المرتجعات</h3>
      {!entries.length ? (
        <p className="return-empty">لا توجد مرتجعات لهذه الفاتورة.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>رقم المرتجع</th>
                <th>التاريخ</th>
                <th>القيمة</th>
                <th>تخفيض الدين</th>
                <th>نقدي</th>
                <th>بطاقة</th>
                <th>عرض</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((r) => (
                <tr key={r.id}>
                  <td>{r.number}</td>
                  <td>{dateTime(r.createdAt)}</td>
                  <td>{money(r.totalCents)}</td>
                  <td>{money(r.debtReductionCents)}</td>
                  <td>{money(r.cashCents)}</td>
                  <td>{money(r.cardCents)}</td>
                  <td>
                    <button
                      className="button soft"
                      onClick={() => setSelected(r.id)}
                    >
                      عرض وطباعة المرتجع
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {receipt && <InvoiceView invoice={receipt} />}
    </div>
  );
}
