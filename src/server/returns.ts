import "server-only";
import { Decimal, type Db } from "./db";
import type { Actor, Row } from "./actor";
import { Finance, allocate, invoiceLines } from "./finance";
import { In, type Json } from "./input";
import { parseJson, stringify, type InvoiceLine, type ReturnedLine } from "./lines";
import { ApiFault, D, Rules, checked, pad8, round, uuid } from "./rules";

export const returnLines = (r: Row) => parseJson<ReturnedLine[]>(r.LinesJson);

/** Net (after discount) cents per original invoice line. */
export function netLines(invoice: Row, lines: InvoiceLine[]) {
  const discounts = allocate(lines, invoice.SubtotalCents, invoice.DiscountCents);
  return lines.map((l, i) => l.totalCents - discounts[i]);
}
/** Difference of cumulative values makes repeated fractional returns sum exactly to the original amount. */
export function portion(total: number, original: Decimal, before: Decimal, amount: Decimal) {
  return Rules.money(D(total).times(before.plus(amount).div(original))) - Rules.money(D(total).times(before.div(original)));
}

function previousQuantities(history: Row[]) {
  const map = new Map<string, Decimal>();
  for (const r of history) for (const l of returnLines(r)) map.set(l.productId, (map.get(l.productId) ?? D(0)).plus(l.quantity));
  return map;
}

export function returnDto(r: Row, includeCost: boolean) {
  return {
    id: r.Id, number: r.Number, kind: r.Kind, invoiceId: r.InvoiceId, date: r.Date, createdAt: (r.CreatedAt as Date).toISOString(),
    totalCents: r.TotalCents, debtReductionCents: r.DebtReductionCents, cashCents: r.CashCents, cardCents: r.CardCents,
    refundMethod: r.RefundMethod, reason: r.Reason, costCents: includeCost ? r.CostCents : null, costComplete: r.CostComplete,
    lines: returnLines(r).map((l) => ({
      productId: l.productId, name: l.name, unit: l.unit, factor: l.factor, quantity: l.quantity,
      unitPriceCents: l.unitPriceCents, totalCents: l.totalCents, costCents: includeCost ? l.costCents : null,
    })),
  };
}

export class Returns {
  finance: Finance;
  constructor(public tx: Db, public actor: Actor) {
    this.finance = new Finance(tx, actor);
  }

  async summary(invoice: Row) {
    const actor = this.actor;
    const [{ Revision: revision }] = await this.tx`SELECT "Revision" FROM "Shops" WHERE "Id" = ${actor.shopId}`;
    const history = await this.tx`SELECT * FROM "InvoiceReturns" WHERE "ShopId" = ${actor.shopId} AND "InvoiceId" = ${invoice.Id} ORDER BY "CreatedAt", "Id"`;
    const previous = previousQuantities(history);
    const lines = invoiceLines(invoice);
    const nets = netLines(invoice, lines);
    const returned = history.reduce((a: number, r: Row) => a + r.TotalCents, 0);
    return {
      invoiceId: invoice.Id,
      originalNumber: invoice.Number,
      revision: String(revision),
      partyBalanceCents: invoice.PartyId ? Math.max(0, await this.finance.partyBalance(invoice.PartyId)) : 0,
      returnedCents: returned,
      remainingCents: invoice.TotalCents - returned,
      lines: lines.map((l, i) => {
        const before = previous.get(l.productId) ?? D(0);
        return { productId: l.productId, name: l.name, unit: l.unit, factor: l.factor, quantity: l.quantity, unitPriceCents: l.unitPriceCents, netCents: nets[i], returnedQuantity: before, remainingQuantity: l.quantity.minus(before) };
      }),
      items: history.map((r: Row) => returnDto(r, actor.seesCost)),
    };
  }

  async create(invoice: Row, input: Json, shop: Row) {
    const actor = this.actor;
    const finance = this.finance;
    if (invoice.Kind === "sale") actor.require("Owner", "Cashier");
    else actor.require("Owner", "Warehouse");
    if (In.str(input.revision) !== String(shop.Revision)) throw new ApiFault(409, "تغيرت الأرصدة أو المرتجعات. أعد تحميل بيانات المرتجع وراجع المبالغ.");
    const refundMethod = In.str(input.refundMethod);
    if (refundMethod !== "cash" && refundMethod !== "card") throw new ApiFault(400, "اختر نقدي أو بطاقة للتسوية.");
    const raw = In.arr(input.lines);
    const requestedLines = (raw ?? []).map((l) => ({ productId: In.guid(l.productId), quantity: In.dec(l.quantity) }));
    if (!raw || requestedLines.length < 1 || requestedLines.length > 200 || new Set(requestedLines.map((l) => l.productId)).size !== requestedLines.length)
      throw new ApiFault(400, "اختر أصناف المرتجع دون تكرار.");
    const kind = invoice.Kind + ".return";
    const entry: Row = {
      Id: uuid(), ShopId: actor.shopId, InvoiceId: invoice.Id, UserId: actor.userId, Date: Rules.today(), CreatedAt: new Date(), Kind: kind,
      Number: `${invoice.Kind === "sale" ? "SR" : "PR"}-${pad8(Number(shop.Revision) + 1)}`, Reason: Rules.text(input.reason, 500), RefundMethod: refundMethod,
      TotalCents: 0, CostCents: 0, DebtReductionCents: 0, CashCents: 0, CardCents: 0, CostComplete: true,
    };
    const original = invoiceLines(invoice);
    const nets = netLines(invoice, original);
    const history = await this.tx`SELECT * FROM "InvoiceReturns" WHERE "ShopId" = ${actor.shopId} AND "InvoiceId" = ${invoice.Id}`;
    const previous = previousQuantities(history);
    const returned: ReturnedLine[] = [];
    for (const requested of requestedLines) {
      const index = original.findIndex((l) => l.productId === requested.productId);
      if (index < 0) throw new ApiFault(404, "الصنف غير موجود في الفاتورة الأصلية.");
      const line = original[index];
      Rules.quantity(requested.quantity, line.unit === "كغم" && line.factor === 1);
      const before = previous.get(line.productId) ?? D(0);
      if (requested.quantity.gt(line.quantity.minus(before))) throw new ApiFault(409, "كمية المرتجع تتجاوز المتبقي من الفاتورة.");
      const [product] = await this.tx`SELECT * FROM "Products" WHERE "ShopId" = ${actor.shopId} AND "Id" = ${line.productId} FOR UPDATE`;
      if (!product) throw new ApiFault(500, "تعذر إكمال الطلب.");
      const quantity = requested.quantity.times(line.factor);
      const net = portion(nets[index], line.quantity, before, requested.quantity);
      let cost: number;
      const stock = product.Stock as Decimal;
      if (invoice.Kind === "sale") {
        cost = portion(Rules.money(line.quantity.times(line.unitCostCents)), line.quantity, before, requested.quantity);
        const known = invoice.CostComplete as boolean;
        const unitCost = D(cost).div(quantity).toSignificantDigits(28);
        product.AverageCostCents = round(stock.lte(0) ? unitCost : stock.times(product.AverageCostCents).plus(cost).div(stock.plus(quantity)), 6);
        product.CostKnown = known && (stock.lte(0) || product.CostKnown);
        await finance.move(product, entry.Id, quantity, kind, entry.Reason, unitCost, known);
        entry.CostComplete &&= known;
      } else {
        if (stock.lt(quantity)) throw new ApiFault(409, "المخزون الحالي لا يكفي لإرجاع الكمية للمورد.");
        // Remove a difference of rounded inventory values so splitting a carton return cannot create a cent of profit.
        cost = checked(round(stock.times(product.AverageCostCents)).minus(round(stock.minus(quantity).times(product.AverageCostCents))).toNumber());
        entry.CostComplete &&= product.CostKnown;
        await finance.move(product, entry.Id, quantity.neg(), kind, entry.Reason);
      }
      entry.TotalCents = checked(entry.TotalCents + net);
      entry.CostCents = checked(entry.CostCents + cost);
      returned.push({ productId: line.productId, name: line.name, unit: line.unit, factor: line.factor, quantity: requested.quantity, unitPriceCents: line.unitPriceCents, totalCents: net, costCents: cost });
    }
    Rules.cents(entry.TotalCents);
    if (invoice.PartyId) {
      entry.DebtReductionCents = Math.min(entry.TotalCents, Math.max(0, await finance.partyBalance(invoice.PartyId)));
      await finance.debt(invoice.PartyId, entry.Id, -entry.DebtReductionCents, kind, entry.Number + " · " + invoice.Number);
    }
    const refund = entry.TotalCents - entry.DebtReductionCents;
    entry.CashCents = refundMethod === "cash" ? refund : 0;
    entry.CardCents = refundMethod === "card" ? refund : 0;
    await finance.cash(entry.Id, invoice.Kind === "sale" ? -entry.CashCents : entry.CashCents, kind, entry.Number + " · " + invoice.Number);
    entry.LinesJson = stringify(returned);
    await this.tx`INSERT INTO "InvoiceReturns" ("Id", "ShopId", "InvoiceId", "UserId", "Number", "Kind", "Date", "CreatedAt", "LinesJson", "TotalCents",
        "DebtReductionCents", "CashCents", "CardCents", "CostCents", "CostComplete", "RefundMethod", "Reason")
      VALUES (${entry.Id}, ${entry.ShopId}, ${entry.InvoiceId}, ${entry.UserId}, ${entry.Number}, ${entry.Kind}, ${entry.Date}, ${entry.CreatedAt}, ${entry.LinesJson}::jsonb,
        ${entry.TotalCents}, ${entry.DebtReductionCents}, ${entry.CashCents}, ${entry.CardCents}, ${entry.CostCents}, ${entry.CostComplete}, ${entry.RefundMethod}, ${entry.Reason})`;
    return returnDto(entry, actor.seesCost);
  }
}
