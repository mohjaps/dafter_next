import "server-only";
import { Decimal, type Db } from "./db";
import type { Actor, Row } from "./actor";
import { In, type Json } from "./input";
import { parseJson, stringify, type InvoiceLine } from "./lines";
import { ApiFault, D, Rules, checked, pad8, round, uuid } from "./rules";

export class Finance {
  constructor(public tx: Db, public actor: Actor) {}

  async partyBalance(partyId: string): Promise<number> {
    const [r] = await this.tx`SELECT COALESCE(SUM("AmountCents"), 0)::bigint AS b FROM "PartyEntries" WHERE "ShopId" = ${this.actor.shopId} AND "PartyId" = ${partyId}`;
    return r.b;
  }
  async cashBalance(): Promise<number> {
    const [r] = await this.tx`SELECT COALESCE(SUM("AmountCents"), 0)::bigint AS b FROM "CashEntries" WHERE "ShopId" = ${this.actor.shopId}`;
    return r.b;
  }
  async cash(reference: string, amount: number, kind: string, description: string) {
    if (amount !== 0)
      await this.tx`INSERT INTO "CashEntries" ("Id", "ShopId", "ReferenceId", "UserId", "AmountCents", "Kind", "Description", "Date")
        VALUES (${uuid()}, ${this.actor.shopId}, ${reference}, ${this.actor.userId}, ${amount}, ${kind}, ${description}, now())`;
  }
  async debt(party: string, reference: string, amount: number, kind: string, note = "") {
    if (amount !== 0)
      await this.tx`INSERT INTO "PartyEntries" ("Id", "ShopId", "PartyId", "ReferenceId", "UserId", "AmountCents", "Kind", "Note", "Date")
        VALUES (${uuid()}, ${this.actor.shopId}, ${party}, ${reference}, ${this.actor.userId}, ${amount}, ${kind}, ${note}, now())`;
  }

  /** Applies a stock movement and persists the product's stock/cost/version. */
  async move(product: Row, reference: string, quantity: Decimal, kind: string, reason = "", movementCost?: Decimal, movementCostKnown?: boolean) {
    product.Stock = (product.Stock as Decimal).plus(quantity);
    product.Version = Number(product.Version) + 1;
    if ((product.Stock as Decimal).abs().gt(1_000_000_000)) throw new ApiFault(400, "رصيد المخزون خارج النطاق.");
    await saveProduct(this.tx, product);
    await this.tx`INSERT INTO "StockMovements" ("Id", "BusinessDate", "CostKnown", "ShopId", "ProductId", "ReferenceId", "UserId", "Kind", "Quantity", "BalanceAfter", "UnitCostCents", "Reason", "Date")
      VALUES (${uuid()}, ${Rules.today()}, ${movementCostKnown ?? product.CostKnown}, ${this.actor.shopId}, ${product.Id}, ${reference}, ${this.actor.userId},
        ${kind}, ${quantity.toString()}, ${product.Stock.toString()}, ${(movementCost ?? product.AverageCostCents).toString()}, ${reason}, now())`;
  }

  async sale(input: Json, shop: Row) {
    const actor = this.actor;
    actor.require("Owner", "Cashier");
    const rawLines = In.arr(input.lines);
    const lines = (rawLines ?? []).map((l) => ({ productId: In.guid(l.productId), quantity: In.dec(l.quantity), unitPriceCents: In.long(l.unitPriceCents) }));
    if (!rawLines || lines.length < 1 || lines.length > 200 || new Set(lines.map((l) => l.productId)).size !== lines.length)
      throw new ApiFault(400, "أضف1–200 منتج دون تكرار السطور.");
    const method = In.str(input.method);
    if (method !== "cash" && method !== "card" && method !== "credit" && method !== "partial") throw new ApiFault(400, "طريقة الدفع غير صالحة.");
    const customerId = In.guidOrNull(input.customerId);
    const discountCents = In.long(input.discountCents);
    const receivedCents = In.long(input.receivedCents);
    let party: Row | undefined;
    if (customerId) {
      [party] = await this.tx`SELECT * FROM "Parties" WHERE "ShopId" = ${actor.shopId} AND "Id" = ${customerId} AND "Kind" = 'customer'`;
      if (!party) throw new ApiFault(404, "الزبون غير موجود.");
    }
    if ((method === "credit" || method === "partial") && !party) throw new ApiFault(400, "اختر الزبون للآجل.");
    const invoice: Row = {
      Id: uuid(), ShopId: actor.shopId, PartyId: party?.Id ?? null, PartyName: party?.Name ?? "زبون نقدي", Kind: "sale",
      Number: `SAL-${pad8(Number(shop.Revision) + 1)}`, Date: Rules.today(), CreatedAt: new Date(), Method: method, Notes: "", CostComplete: true,
    };
    const invoiceLines: InvoiceLine[] = [];
    const warnings: string[] = [];
    let subtotal = 0;
    let cost = 0;
    for (const line of lines) {
      const [p] = await this.tx`SELECT * FROM "Products" WHERE "ShopId" = ${actor.shopId} AND "Id" = ${line.productId} AND NOT "Archived" FOR UPDATE`;
      if (!p) throw new ApiFault(404, "منتج غير متاح.");
      Rules.quantity(line.quantity, p.Unit === "كغم");
      Rules.cents(line.unitPriceCents);
      if (line.unitPriceCents !== p.SalePriceCents) throw new ApiFault(409, "تغير سعر منتج. أعد تحميل الأسعار.");
      if (!p.CostKnown) invoice.CostComplete = false;
      const total = Rules.money(line.quantity.times(p.SalePriceCents));
      subtotal = checked(subtotal + total);
      cost = checked(cost + Rules.money(line.quantity.times(p.AverageCostCents)));
      invoiceLines.push({ productId: p.Id, name: p.Name, unit: p.Unit, quantity: line.quantity, factor: 1, unitPriceCents: p.SalePriceCents, totalCents: total, unitCostCents: p.AverageCostCents });
      if ((p.Stock as Decimal).lt(line.quantity)) warnings.push(`مخزون سالب: ${p.Name}`);
      await this.move(p, invoice.Id, line.quantity.neg(), "sale");
    }
    Rules.cents(subtotal);
    Rules.cents(discountCents);
    Rules.cents(receivedCents);
    if (discountCents > subtotal) throw new ApiFault(400, "الخصم يتجاوز المجموع.");
    const totalCents = subtotal - discountCents;
    if (method === "cash" && receivedCents < totalCents) throw new ApiFault(400, "المستلم أقل من الإجمالي.");
    if (method === "partial" && (receivedCents <= 0 || receivedCents >= totalCents)) throw new ApiFault(400, "الدفع الجزئي يجب أن يكون بين صفر والإجمالي.");
    Object.assign(invoice, {
      SubtotalCents: subtotal, DiscountCents: discountCents, TotalCents: totalCents, CostCents: cost,
      PaidCents: method === "credit" ? 0 : method === "partial" ? receivedCents : totalCents,
      ChangeCents: method === "cash" ? receivedCents - totalCents : 0,
      LinesJson: stringify(invoiceLines),
    });
    invoice.OutstandingCents = totalCents - invoice.PaidCents;
    await insertInvoice(this.tx, invoice);
    if (party) await this.debt(party.Id, invoice.Id, invoice.OutstandingCents, "sale");
    if (method === "cash" || method === "partial") await this.cash(invoice.Id, invoice.PaidCents, "sale", invoice.Number);
    return { ...invoiceDto(invoice, actor.seesCost), warnings };
  }

  async purchase(input: Json, shop: Row) {
    const actor = this.actor;
    actor.require("Owner", "Warehouse");
    const supplierId = In.guid(input.supplierId);
    const date = In.date(input.date);
    const rawLines = In.arr(input.lines);
    const lines = (rawLines ?? []).map((l) => ({ productId: In.guid(l.productId), quantity: In.dec(l.quantity), factor: In.int(l.factor), unitCostCents: In.long(l.unitCostCents) }));
    const discountCents = In.long(input.discountCents);
    const paidCents = In.long(input.paidCents);
    const notes = In.str(input.notes);
    const [party] = await this.tx`SELECT * FROM "Parties" WHERE "ShopId" = ${actor.shopId} AND "Id" = ${supplierId} AND "Kind" = 'supplier'`;
    if (!party) throw new ApiFault(404, "المورد غير موجود.");
    if (!rawLines || lines.length < 1 || lines.length > 200 || new Set(lines.map((l) => l.productId)).size !== lines.length)
      throw new ApiFault(400, "أضف1–200 منتج دون تكرار.");
    if (!date || date > Rules.today()) throw new ApiFault(400, "تاريخ الشراء غير صالح أو في المستقبل.");
    const invoice: Row = {
      Id: uuid(), ShopId: actor.shopId, PartyId: party.Id, PartyName: party.Name, Kind: "purchase", Number: `PUR-${pad8(Number(shop.Revision) + 1)}`,
      Date: date, CreatedAt: new Date(), Notes: Rules.optional(notes), CostComplete: true, CostCents: 0, ChangeCents: 0,
    };
    const invoiceLines: InvoiceLine[] = [];
    const products: Row[] = [];
    let subtotal = 0;
    for (const line of lines) {
      const [p] = await this.tx`SELECT * FROM "Products" WHERE "ShopId" = ${actor.shopId} AND "Id" = ${line.productId} AND NOT "Archived" FOR UPDATE`;
      if (!p) throw new ApiFault(404, "المنتج غير متاح.");
      Rules.quantity(line.quantity, p.Unit === "كغم" && line.factor === 1);
      Rules.cents(line.unitCostCents);
      if (line.factor !== 1 && line.factor !== p.CartonSize) throw new ApiFault(409, "حجم الكرتونة لا يطابق إعداد المنتج.");
      const total = Rules.money(line.quantity.times(line.unitCostCents));
      subtotal = checked(subtotal + total);
      products.push(p);
      invoiceLines.push({ productId: p.Id, name: p.Name, unit: line.factor === 1 ? p.Unit : "كرتونة", quantity: line.quantity, factor: line.factor, unitPriceCents: line.unitCostCents, totalCents: total, unitCostCents: p.AverageCostCents });
    }
    Rules.cents(subtotal);
    Rules.cents(discountCents);
    Rules.cents(paidCents);
    if (discountCents > subtotal || paidCents > subtotal - discountCents) throw new ApiFault(400, "راجع الخصم والمدفوع.");
    // Proportional integer-cent allocation with exact remainder and no negative line costs.
    const discounts = allocate(invoiceLines, subtotal, discountCents);
    for (let index = 0; index < invoiceLines.length; index++) {
      const line = invoiceLines[index];
      const p = products[index];
      const share = discounts[index];
      const qty = line.quantity.times(line.factor);
      const incomingCost = D(line.totalCents - share).div(qty).toSignificantDigits(28);
      const stock = p.Stock as Decimal;
      p.AverageCostCents = round(stock.lte(0) ? incomingCost : stock.times(p.AverageCostCents).plus(line.totalCents - share).div(stock.plus(qty)), 6);
      p.CostKnown = true;
      await this.move(p, invoice.Id, qty, "purchase");
      invoiceLines[index] = { ...line, unitCostCents: incomingCost };
    }
    Object.assign(invoice, {
      SubtotalCents: subtotal, DiscountCents: discountCents, TotalCents: subtotal - discountCents, PaidCents: paidCents,
      LinesJson: stringify(invoiceLines),
    });
    invoice.OutstandingCents = invoice.TotalCents - paidCents;
    invoice.Method = paidCents === invoice.TotalCents ? "cash" : paidCents === 0 ? "credit" : "partial";
    await insertInvoice(this.tx, invoice);
    await this.debt(party.Id, invoice.Id, invoice.OutstandingCents, "purchase");
    await this.cash(invoice.Id, -paidCents, "purchase", invoice.Number);
    return invoiceDto(invoice);
  }
}

/** Whole-cent proportional discount allocation, remainder assigned in original line order. */
export function allocate(lines: { totalCents: number }[], subtotal: number, discount: number): number[] {
  const discounts = lines.map((l) => (subtotal === 0 ? 0 : D(l.totalCents).times(discount).div(subtotal).floor().toNumber()));
  let remainder = discount - discounts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lines.length && remainder > 0; i++)
    if (discounts[i] < lines[i].totalCents) {
      discounts[i]++;
      remainder--;
    }
  return discounts;
}

export async function saveProduct(tx: Db, p: Row) {
  await tx`UPDATE "Products" SET "Name" = ${p.Name}, "Barcode" = ${p.Barcode}, "Category" = ${p.Category}, "Unit" = ${p.Unit},
    "SalePriceCents" = ${p.SalePriceCents}, "Stock" = ${String(p.Stock)}, "CostKnown" = ${p.CostKnown}, "AverageCostCents" = ${String(p.AverageCostCents)},
    "Minimum" = ${String(p.Minimum)}, "CartonSize" = ${p.CartonSize}, "Archived" = ${p.Archived}, "Version" = ${p.Version}
    WHERE "ShopId" = ${p.ShopId} AND "Id" = ${p.Id}`;
}

async function insertInvoice(tx: Db, i: Row) {
  await tx`INSERT INTO "Invoices" ("Id", "ShopId", "PartyId", "PartyName", "Kind", "Number", "Date", "CreatedAt", "LinesJson", "SubtotalCents", "DiscountCents",
      "TotalCents", "PaidCents", "OutstandingCents", "ChangeCents", "CostComplete", "CostCents", "Method", "Notes")
    VALUES (${i.Id}, ${i.ShopId}, ${i.PartyId}, ${i.PartyName}, ${i.Kind}, ${i.Number}, ${i.Date}, ${i.CreatedAt}, ${i.LinesJson}::jsonb, ${i.SubtotalCents},
      ${i.DiscountCents}, ${i.TotalCents}, ${i.PaidCents}, ${i.OutstandingCents}, ${i.ChangeCents}, ${i.CostComplete}, ${i.CostCents}, ${i.Method}, ${i.Notes})`;
}

export const invoiceLines = (i: Row) => parseJson<InvoiceLine[]>(i.LinesJson);

export function invoiceDto(i: Row, includeCost = true) {
  return {
    id: i.Id,
    version: String((i.CreatedAt as Date).getTime()),
    number: i.Number,
    date: i.Date,
    createdAt: (i.CreatedAt as Date).toISOString(),
    kind: i.Kind,
    customerId: i.Kind === "sale" ? i.PartyId : null,
    supplierId: i.Kind === "purchase" ? i.PartyId : null,
    partyName: i.PartyName,
    lines: invoiceLines(i).map((l) => ({
      productId: l.productId, name: l.name, unit: l.unit, quantity: l.quantity, factor: l.factor,
      unitPriceCents: l.unitPriceCents, totalCents: l.totalCents, unitCostCents: includeCost ? l.unitCostCents : null,
    })),
    subtotalCents: i.SubtotalCents,
    discountCents: i.DiscountCents,
    totalCents: i.TotalCents,
    paidCents: i.PaidCents,
    outstandingCents: i.OutstandingCents,
    changeCents: i.ChangeCents,
    costCents: includeCost ? i.CostCents : null,
    costComplete: i.CostComplete,
    method: i.Method,
    notes: i.Notes,
  };
}
