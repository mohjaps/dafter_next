"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useData } from "./data";
import { ThermalReceipt } from "./thermal";
import type { PaperWidth } from "./thermal";
import { printThermal } from "./thermalPrint";
import { Printer } from "lucide-react";
import { Status } from "./ui";
import type { Invoice, Row } from "./types";
import { text, money, methods } from "./types";
export function InvoiceView({
  invoice,
  autoPrint = false,
  paper: controlledPaper,
  onPaperChange,
}: {
  invoice: Invoice;
  autoPrint?: boolean;
  paper?: PaperWidth;
  onPaperChange?: (paper: PaperWidth) => void;
}) {
  const isReturn =
    invoice.kind === "sale.return" || invoice.kind === "purchase.return";
  const title = isReturn
    ? invoice.kind === "sale.return"
      ? "مرتجع بيع"
      : "مرتجع شراء"
    : "فاتورة";
  const settings = useData<Row>("/settings");
  const [localPaper, setLocalPaper] = useState<PaperWidth>(80);
  const paper = controlledPaper ?? localPaper;
  const setPaper = (value: PaperWidth) => {
    setLocalPaper(value);
    onPaperChange?.(value);
  };
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");
  const receiptRef = useRef<HTMLDivElement>(null);
  const printPending = useRef(false);
  const attempted = useRef(new Set<string>());
  const print = useCallback(async () => {
    if (!receiptRef.current || printPending.current) return;
    printPending.current = true;
    setPrinting(true);
    setPrintError("");
    try {
      const receipt =
        receiptRef.current.querySelector<HTMLElement>(".thermal-receipt");
      if (!receipt) throw new Error("تعذر تجهيز الفاتورة.");
      await printThermal(receipt, paper);
    } catch (e) {
      setPrintError(
        `تعذرت الطباعة. الفاتورة محفوظة ويمكن إعادة طباعتها. ${e instanceof Error ? e.message : ""}`,
      );
    } finally {
      printPending.current = false;
      setPrinting(false);
    }
  }, [paper]);
  useEffect(() => {
    if (!autoPrint || !settings.data || attempted.current.has(invoice.id))
      return;
    let active = true;
    queueMicrotask(() => {
      if (!active || attempted.current.has(invoice.id)) return;
      attempted.current.add(invoice.id);
      void print();
    });
    return () => {
      active = false;
    };
  }, [autoPrint, settings.data, invoice.id, print]);
  const purchase =
    invoice.kind === "purchase" || invoice.kind === "purchase.return";
  const totals = isReturn
    ? [
        ["تخفيض الدين", invoice.debtReductionCents],
        ["تسوية نقدية", invoice.cashCents],
        ["استرداد بطاقة مسجّل", invoice.cardCents],
      ]
    : [
        ["قبل الخصم", invoice.subtotalCents],
        ["الخصم", invoice.discountCents],
        ["المدفوع عند الإصدار", invoice.paidCents],
        ["المتبقي عند الإصدار", invoice.outstandingCents],
        ["الباقي للزبون", invoice.changeCents],
      ];
  return (
    <section
      className="panel section-gap receipt invoice-card"
      id={isReturn ? `return-print-${invoice.id}` : "invoice-print"}
    >
      <header className="invoice-header">
        <div className="invoice-heading">
          <span className="invoice-kicker">
            {settings.data ? text(settings.data.name) : "دفتر"}
          </span>
          <h2>
            {title} <bdi>{invoice.number}</bdi>
          </h2>
          <div className="invoice-meta">
            <span>
              {purchase ? "المورد" : "الزبون"}: {invoice.partyName}
            </span>
            <span>
              <bdi>{invoice.date}</bdi>
            </span>
            <span className="invoice-badge">
              {methods[invoice.method] || invoice.method}
            </span>
          </div>
        </div>
        <div className="actions no-print thermal-controls">
          <label>
            مقاس الورق
            <select
              aria-label="عرض ورق الطابعة الحرارية"
              value={paper}
              onChange={(e) => setPaper(Number(e.target.value) as PaperWidth)}
            >
              <option value={80}>80 مم</option>
              <option value={58}>58 مم</option>
            </select>
          </label>
          <button
            className="button soft"
            disabled={printing || settings.loading || !settings.data}
            onClick={() => void print()}
          >
            <Printer size={16} />
            {printing ? "جارٍ تجهيز الطباعة…" : "طباعة"}
          </button>
        </div>
      </header>
      {autoPrint && (
        <p className="invoice-notice" role="status">
          الفاتورة محفوظة في المبيعات. إلغاء الطباعة لا يلغي البيع.
        </p>
      )}
      <div className="invoice-body">
        <div className="invoice-items">
          <div className="invoice-section-title">
            <h3>الأصناف</h3>
            <span>{invoice.lines.length} صنف</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>الصنف</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th>{isReturn ? "الصافي" : "المجموع"}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line, index) => (
                  <tr key={index}>
                    <td className="invoice-row-number">{index + 1}</td>
                    <td>
                      <strong>{line.name}</strong>
                      <small className="invoice-unit">
                        {line.unit}
                        {line.factor > 1 ? ` · ${line.factor} وحدة للعبوة` : ""}
                      </small>
                    </td>
                    <td>
                      <bdi>{line.quantity}</bdi>
                    </td>
                    <td>
                      <bdi>{money(line.unitPriceCents)}</bdi>
                    </td>
                    <td>
                      <strong>
                        <bdi>{money(line.totalCents)}</bdi>
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isReturn && (
            <p className="invoice-footnote">
              الفاتورة الأصلية: <bdi>{text(invoice.originalNumber)}</bdi> · قيم
              الأصناف بعد توزيع الخصم الأصلي.
            </p>
          )}
          {invoice.notes && (
            <div className="invoice-notes">
              <span>ملاحظات</span>
              <p>{invoice.notes}</p>
            </div>
          )}
          {!isReturn && (
            <p className="invoice-footnote">
              قيم الفاتورة وقت الإصدار؛ تُسجّل التسديدات والمرتجعات في حركات
              مستقلة.
            </p>
          )}
        </div>
        <aside className="invoice-summary" aria-label="ملخص الفاتورة">
          <span>{isReturn ? "إجمالي المرتجع" : "إجمالي الفاتورة"}</span>
          <strong className="invoice-grand-total">
            <bdi>{money(invoice.totalCents)}</bdi>
          </strong>
          <dl>
            {totals.map(([label, value]) => (
              <div key={String(label)}>
                <dt>{String(label)}</dt>
                <dd>
                  <bdi>{money(value)}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          {settings.data && (
            <p className="invoice-thanks">{text(settings.data.receiptNote)}</p>
          )}
        </aside>
      </div>
      {printError && (
        <p className="customer-error invoice-feedback no-print" role="alert">
          {printError}
        </p>
      )}
      {settings.error && (
        <div className="no-print invoice-feedback">
          <Status {...settings} />
        </div>
      )}
      <div hidden aria-hidden="true" ref={receiptRef}>
        <ThermalReceipt invoice={invoice} shop={settings.data} />
      </div>
      {invoice.warnings?.map((w) => (
        <p className="warning-state invoice-feedback" key={w}>
          {w}
        </p>
      ))}
    </section>
  );
}
