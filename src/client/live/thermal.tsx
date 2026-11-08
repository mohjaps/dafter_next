import type { Invoice, Row } from "./types";
import { money, text, methods } from "./types";
export type PaperWidth = 58 | 80;
export function ThermalReceipt({
  invoice,
  shop,
}: {
  invoice: Invoice;
  shop: Row | null;
}) {
  const isReturn =
    invoice.kind === "sale.return" || invoice.kind === "purchase.return";
  const purchase =
    invoice.kind === "purchase" || invoice.kind === "purchase.return";
  const title = isReturn
    ? purchase
      ? "مرتجع شراء"
      : "مرتجع بيع"
    : purchase
      ? "فاتورة شراء"
      : "فاتورة بيع";
  const totals = isReturn
    ? [
        ["إجمالي المرتجع", invoice.totalCents],
        ["تخفيض الدين", invoice.debtReductionCents],
        ["تسوية نقدية", invoice.cashCents],
        ["استرداد بطاقة مسجّل", invoice.cardCents],
      ]
    : [
        ["قبل الخصم", invoice.subtotalCents],
        ["الخصم", invoice.discountCents],
        ["الإجمالي", invoice.totalCents],
        ["المدفوع", invoice.paidCents],
        ["المتبقي", invoice.outstandingCents],
        ["الباقي للزبون", invoice.changeCents],
      ];
  return (
    <article className="thermal-receipt" dir="rtl" lang="ar">
      <header>
        <h1>{text(shop?.name) || "فاتورة"}</h1>
        {!!shop?.address && <p>{text(shop.address)}</p>}
        {!!shop?.phone && <p dir="ltr">{text(shop.phone)}</p>}
        <h2>{title}</h2>
        {isReturn && <p>الفاتورة الأصلية: {text(invoice.originalNumber)}</p>}
        <p>
          <bdi>{invoice.number}</bdi>
        </p>
      </header>
      <div className="thermal-meta">
        <p>
          <span>التاريخ</span>
          <bdi>{invoice.date}</bdi>
        </p>
        <p>
          <span>{purchase ? "المورد" : "الزبون"}</span>
          <strong>{invoice.partyName}</strong>
        </p>
        <p>
          <span>الدفع</span>
          <span>{methods[invoice.method] || invoice.method}</span>
        </p>
      </div>
      <table aria-label="أصناف الفاتورة">
        <thead>
          <tr>
            <th>الصنف</th>
            <th>الكمية</th>
            <th>السعر</th>
            <th>{isReturn ? "الصافي" : "المجموع"}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line, index) => (
            <tr key={index}>
              <td>
                <strong>{line.name}</strong>
                <small>
                  {line.unit}
                  {line.factor > 1 ? ` · ${line.factor} وحدة` : ""}
                </small>
              </td>
              <td>
                <bdi>{line.quantity}</bdi>
              </td>
              <td>
                <bdi>{amount(line.unitPriceCents)}</bdi>
              </td>
              <td>
                <bdi>{amount(line.totalCents)}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="thermal-totals">
        {totals.map(([label, value]) => (
          <div
            className={
              label === "الإجمالي" || label === "إجمالي المرتجع"
                ? "thermal-total"
                : ""
            }
            key={String(label)}
          >
            <dt>{String(label)}</dt>
            <dd>
              <bdi>{money(value)}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      {invoice.notes && <p className="thermal-notes">{invoice.notes}</p>}
      <footer>
        {!!shop?.receiptNote && <p>{text(shop.receiptNote)}</p>}
        <small>دفتر</small>
      </footer>
    </article>
  );
}
function amount(value: number) {
  return (value / 100).toFixed(2);
}
