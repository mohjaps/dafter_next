import "server-only";
import { db, type Db } from "../db";
import type { Actor, Row } from "../actor";
import { command } from "../commands";
import { Finance, invoiceDto, saveProduct } from "../finance";
import { In, paging, queryDate, queryGuid, type Json } from "../input";
import { Returns } from "../returns";
import { ApiFault, D, Rules, addDays, checked, dayNumber, out, pad8, round, uuid } from "../rules";
export { page };
import type { Ctx, Router } from "../http";

const like = (q: string) => "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";

function productDto(p: Row, includeCost = true) {
  return {
    id: p.Id, version: String(p.Version), name: p.Name, barcode: p.Barcode, category: p.Category, unit: p.Unit,
    salePriceCents: p.SalePriceCents, stock: p.Stock, averageCostCents: includeCost ? p.AverageCostCents : null,
    costKnown: p.CostKnown, minimum: p.Minimum, cartonSize: p.CartonSize, archived: p.Archived,
  };
}

type ProductInput = { name: string | null; barcode: string | null; category: string | null; unit: string | null; salePriceCents: number; minimum: ReturnType<typeof In.dec>; cartonSize: number; archived: boolean };
function readProduct(input: Json): ProductInput {
  return {
    name: In.str(input.name), barcode: In.str(input.barcode), category: In.str(input.category), unit: In.str(input.unit),
    salePriceCents: In.long(input.salePriceCents), minimum: In.dec(input.minimum), cartonSize: In.int(input.cartonSize), archived: In.bool(input.archived),
  };
}
function applyProduct(p: Row, i: ProductInput) {
  Rules.cents(i.salePriceCents);
  Rules.quantity(i.minimum, true, true);
  if (i.cartonSize < 1 || i.cartonSize > 100000) throw new ApiFault(400, "حجم الكرتونة غير صالح.");
  if (!["قطعة", "عبوة", "كيس", "كغم", "لتر"].includes(i.unit ?? "")) throw new ApiFault(400, "وحدة غير صالحة.");
  p.Name = Rules.text(i.name);
  p.Barcode = Rules.optional(i.barcode, 64);
  p.Category = Rules.text(i.category, 80);
  p.Unit = i.unit;
  p.SalePriceCents = i.salePriceCents;
  p.Minimum = i.minimum;
  p.CartonSize = i.cartonSize;
  p.Archived = i.archived;
}

async function page(count: Promise<Row[]>, items: Promise<Row[]>, pg: number, size: number, map: (r: Row) => unknown = out) {
  const [[{ n }], rows] = await Promise.all([count, items]);
  return { items: rows.map(map), page: pg, pageSize: size, total: n };
}

const saleRoles = ["Owner", "Cashier", "Accountant"];
const purchaseRoles = ["Owner", "Warehouse", "Accountant"];

export function mapMerchant(r: Router) {
  const sql = () => db();

  r.get("/products", async ({ actor: a, query }) => {
    a.merchantRead();
    const [pg, size] = paging(query);
    const q = query.get("q")?.trim() ? Rules.optional(query.get("q"), 100) : null;
    const status = query.get("status");
    const s = sql();
    const search = q ? s`AND ("Name" LIKE ${like(q)} OR "Barcode" LIKE ${like(q)})` : s``;
    const filter = status === "archived" ? s`AND "Archived"` : status === "low" ? s`AND NOT "Archived" AND "Stock" <= "Minimum"` : status === "all" ? s`` : s`AND NOT "Archived"`;
    return page(
      s`SELECT count(*)::int AS n FROM "Products" WHERE "ShopId" = ${a.shopId} ${search} ${filter}`,
      s`SELECT * FROM "Products" WHERE "ShopId" = ${a.shopId} ${search} ${filter} ORDER BY "Name", "Id" OFFSET ${(pg - 1) * size} LIMIT ${size}`,
      pg, size, (p) => productDto(p, a.seesCost));
  });

  r.post("/products", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner");
    const input = readProduct(In.obj(await ctx.body()));
    return command(ctx, "product.create", input, async (_shop, tx) => {
      const p: Row = { Id: uuid(), ShopId: a.shopId, Stock: D(0), CostKnown: false, AverageCostCents: D(0), Version: 0 };
      applyProduct(p, input);
      await tx`INSERT INTO "Products" ("Id", "ShopId", "Name", "Barcode", "Category", "Unit", "SalePriceCents", "Stock", "CostKnown", "AverageCostCents", "Minimum", "CartonSize", "Archived", "Version")
        VALUES (${p.Id}, ${p.ShopId}, ${p.Name}, ${p.Barcode}, ${p.Category}, ${p.Unit}, ${p.SalePriceCents}, 0, false, 0, ${p.Minimum.toString()}, ${p.CartonSize}, ${p.Archived}, 0)`;
      return productDto(p);
    });
  });

  r.patch("/products/:id", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner");
    const id = ctx.params.id;
    const body = In.obj(await ctx.body());
    const input = {
      name: In.str(body.name), barcode: In.str(body.barcode), category: In.str(body.category), unit: In.str(body.unit),
      salePriceCents: In.longOrNull(body.salePriceCents), minimum: In.decOrNull(body.minimum), cartonSize: body.cartonSize == null ? null : In.int(body.cartonSize),
      archived: In.boolOrNull(body.archived), version: In.str(body.version),
    };
    return command(ctx, "product.update", { id, input }, async (_shop, tx) => {
      const [p] = await tx`SELECT * FROM "Products" WHERE "ShopId" = ${a.shopId} AND "Id" = ${id} FOR UPDATE`;
      if (!p) throw new ApiFault(404, "المنتج غير موجود.");
      if (input.version !== String(p.Version)) throw new ApiFault(409, "تغير المنتج؛ أعد تحميله.");
      const next: ProductInput = {
        name: input.name ?? p.Name, barcode: input.barcode ?? p.Barcode, category: input.category ?? p.Category, unit: input.unit ?? p.Unit,
        salePriceCents: input.salePriceCents ?? p.SalePriceCents, minimum: input.minimum ?? p.Minimum, cartonSize: input.cartonSize ?? p.CartonSize, archived: input.archived ?? p.Archived,
      };
      if (next.unit !== p.Unit && !p.Stock.isZero()) throw new ApiFault(409, "لا يمكن تغيير وحدة منتج لديه رصيد.");
      applyProduct(p, next);
      p.Version = Number(p.Version) + 1;
      await saveProduct(tx, p);
      return productDto(p);
    });
  });

  for (const [path, kind] of [["customers", "customer"], ["suppliers", "supplier"]] as const) {
    r.get(`/${path}`, async ({ actor: a, query }) => {
      a.merchantRead();
      const [pg, size] = paging(query);
      const q = query.get("q")?.trim() ? query.get("q")! : null;
      const s = sql();
      const search = q ? s`AND ("Name" LIKE ${like(q)} OR "Phone" LIKE ${like(q)})` : s``;
      const [[{ n }], parties] = await Promise.all([
        s`SELECT count(*)::int AS n FROM "Parties" WHERE "ShopId" = ${a.shopId} AND "Kind" = ${kind} ${search}`,
        s`SELECT * FROM "Parties" WHERE "ShopId" = ${a.shopId} AND "Kind" = ${kind} ${search} ORDER BY "Name", "Id" OFFSET ${(pg - 1) * size} LIMIT ${size}`,
      ]);
      const ids = parties.map((p: Row) => p.Id);
      const balances = new Map<string, number>();
      if (ids.length)
        for (const b of await s`SELECT "PartyId", SUM("AmountCents")::bigint AS b FROM "PartyEntries" WHERE "ShopId" = ${a.shopId} AND "PartyId" IN ${s(ids)} GROUP BY "PartyId"`)
          balances.set(b.PartyId, b.b);
      return { items: parties.map((p: Row) => ({ id: p.Id, version: "1", name: p.Name, phone: p.Phone, balanceCents: balances.get(p.Id) ?? 0 })), page: pg, pageSize: size, total: n };
    });

    r.post(`/${path}`, async (ctx) => {
      const a = ctx.actor;
      if (kind === "customer") a.require("Owner", "Cashier");
      else a.require("Owner", "Warehouse");
      const body = In.obj(await ctx.body());
      const input = { name: In.str(body.name), phone: In.str(body.phone) };
      return command(ctx, kind + ".create", input, async (_shop, tx) => {
        const p = { Id: uuid(), Name: Rules.text(input.name), Phone: Rules.optional(input.phone, 30) };
        await tx`INSERT INTO "Parties" ("Id", "ShopId", "Kind", "Name", "Phone") VALUES (${p.Id}, ${a.shopId}, ${kind}, ${p.Name}, ${p.Phone})`;
        return { id: p.Id, version: "1", name: p.Name, phone: p.Phone, balanceCents: 0 };
      });
    });

    r.get(`/${path}/:id/statement`, async ({ actor: a, params, query }) => {
      a.merchantRead();
      const s = sql();
      const [exists] = await s`SELECT 1 FROM "Parties" WHERE "ShopId" = ${a.shopId} AND "Id" = ${params.id} AND "Kind" = ${kind}`;
      if (!exists) throw new ApiFault(404, "الحساب غير موجود.");
      const [pg, size] = paging(query, 50);
      const [[{ n, b }], items] = await Promise.all([
        s`SELECT count(*)::int AS n, COALESCE(SUM("AmountCents"), 0)::bigint AS b FROM "PartyEntries" WHERE "ShopId" = ${a.shopId} AND "PartyId" = ${params.id}`,
        s`SELECT * FROM "PartyEntries" WHERE "ShopId" = ${a.shopId} AND "PartyId" = ${params.id} ORDER BY "Date" DESC, "Id" OFFSET ${(pg - 1) * size} LIMIT ${size}`,
      ]);
      return { balanceCents: b, items: items.map((r: Row) => out(r)), page: pg, pageSize: size, total: n };
    });

    r.post(`/${path}/:id/payments`, async (ctx) => {
      const a = ctx.actor;
      if (kind === "customer") a.require("Owner", "Cashier");
      else a.require("Owner");
      const id = ctx.params.id;
      const body = In.obj(await ctx.body());
      const input = { amountCents: In.long(body.amountCents), note: In.str(body.note) };
      return command(ctx, kind + ".payment", { id, input }, async (_shop, tx) => {
        const [exists] = await tx`SELECT 1 FROM "Parties" WHERE "ShopId" = ${a.shopId} AND "Id" = ${id} AND "Kind" = ${kind}`;
        if (!exists) throw new ApiFault(404, "الحساب غير موجود.");
        Rules.cents(input.amountCents, false);
        const f = new Finance(tx, a);
        const balance = await f.partyBalance(id);
        if (input.amountCents > balance) throw new ApiFault(409, "المبلغ يتجاوز الرصيد المستحق.");
        const reference = uuid();
        await f.debt(id, reference, -input.amountCents, "payment", Rules.optional(input.note));
        await f.cash(reference, kind === "customer" ? input.amountCents : -input.amountCents, kind + ".payment", Rules.optional(input.note));
        return { id: reference, balanceCents: balance - input.amountCents };
      });
    });
  }

  r.post("/sales", async (ctx) => {
    ctx.actor.require("Owner", "Cashier");
    const input = In.obj(await ctx.body());
    return command(ctx, "sale.create", input, (shop, tx) => new Finance(tx, ctx.actor).sale(input, shop));
  });
  r.post("/purchases", async (ctx) => {
    ctx.actor.require("Owner", "Warehouse");
    const input = In.obj(await ctx.body());
    return command(ctx, "purchase.create", input, (shop, tx) => new Finance(tx, ctx.actor).purchase(input, shop));
  });

  for (const [path, kind] of [["sales", "sale"], ["purchases", "purchase"]] as const) {
    const roles = kind === "sale" ? saleRoles : purchaseRoles;
    r.get(`/${path}`, async ({ actor: a, query }) => {
      a.require(...roles);
      const from = queryDate(query, "from");
      const to = queryDate(query, "to");
      if (from && to && from > to) throw new ApiFault(400, "نطاق التواريخ غير صالح.");
      const [pg, size] = paging(query);
      const q = query.get("q")?.trim() ? query.get("q")! : null;
      const method = query.get("method")?.trim() ? query.get("method")! : null;
      const s = sql();
      const where = s`"ShopId" = ${a.shopId} AND "Kind" = ${kind}
        ${q ? s`AND ("Number" LIKE ${like(q)} OR "PartyName" LIKE ${like(q)})` : s``}
        ${from ? s`AND "Date" >= ${from}` : s``} ${to ? s`AND "Date" <= ${to}` : s``} ${method ? s`AND "Method" = ${method}` : s``}`;
      return page(
        s`SELECT count(*)::int AS n FROM "Invoices" WHERE ${where}`,
        s`SELECT * FROM "Invoices" WHERE ${where} ORDER BY "CreatedAt" DESC, "Id" OFFSET ${(pg - 1) * size} LIMIT ${size}`,
        pg, size, (i) => invoiceDto(i, a.seesCost));
    });

    const load = async (a: Actor, id: string, tx: Db = sql()) => {
      const [invoice] = await tx`SELECT * FROM "Invoices" WHERE "ShopId" = ${a.shopId} AND "Id" = ${id} AND "Kind" = ${kind}`;
      if (!invoice) throw new ApiFault(404, "الفاتورة غير موجودة.");
      return invoice;
    };
    r.get(`/${path}/:id`, async ({ actor: a, params }) => {
      a.require(...roles);
      return invoiceDto(await load(a, params.id), a.seesCost);
    });
    r.get(`/${path}/:id/returns`, async ({ actor: a, params }) => {
      a.require(...roles);
      const invoice = await load(a, params.id);
      return new Returns(sql(), a).summary(invoice);
    });
    r.post(`/${path}/:id/returns`, async (ctx) => {
      const a = ctx.actor;
      if (kind === "sale") a.require("Owner", "Cashier");
      else a.require("Owner", "Warehouse");
      const id = ctx.params.id;
      const input = In.obj(await ctx.body());
      return command(ctx, kind + ".return", { id, input }, async (shop, tx) => new Returns(tx, a).create(await load(a, id, tx), input, shop));
    });
  }

  r.get("/expenses", async ({ actor: a, query }) => {
    a.require("Owner", "Accountant");
    const [pg, size] = paging(query);
    const s = sql();
    return page( s`SELECT count(*)::int AS n FROM "Expenses" WHERE "ShopId" = ${a.shopId}`,
      s`SELECT * FROM "Expenses" WHERE "ShopId" = ${a.shopId} ORDER BY "CreatedAt" DESC OFFSET ${(pg - 1) * size} LIMIT ${size}`, pg, size);
  });
  r.post("/expenses", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner");
    const body = In.obj(await ctx.body());
    const input = { description: In.str(body.description), category: In.str(body.category), amountCents: In.long(body.amountCents), date: In.date(body.date) };
    return command(ctx, "expense.create", input, async (shop, tx) => {
      Rules.cents(input.amountCents, false);
      if (!input.date || input.date > Rules.today()) throw new ApiFault(400, "تاريخ المصروف غير صالح.");
      const e = {
        Id: uuid(), ShopId: a.shopId, UserId: a.userId, Number: `EXP-${pad8(Number(shop.Revision) + 1)}`, Description: Rules.text(input.description, 250),
        Category: Rules.text(input.category, 80), AmountCents: input.amountCents, Date: input.date, CreatedAt: new Date(), Cancelled: false,
        CancellationReason: "", ReversalDate: null, CancelledAt: null,
      };
      await tx`INSERT INTO "Expenses" ${tx(e)}`;
      await new Finance(tx, a).cash(e.Id, -e.AmountCents, "expense", e.Description);
      return out(e);
    });
  });
  r.post("/expenses/:id/cancel", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner");
    const id = ctx.params.id;
    const input = { reason: In.str(In.obj(await ctx.body()).reason) };
    return command(ctx, "expense.cancel", { id, input }, async (_shop, tx) => {
      const [e] = await tx`SELECT * FROM "Expenses" WHERE "ShopId" = ${a.shopId} AND "Id" = ${id} FOR UPDATE`;
      if (!e) throw new ApiFault(404, "المصروف غير موجود.");
      if (e.Cancelled) throw new ApiFault(409, "المصروف ملغى بالفعل.");
      Object.assign(e, { Cancelled: true, CancellationReason: Rules.text(input.reason, 250), CancelledAt: new Date(), ReversalDate: Rules.today() });
      await tx`UPDATE "Expenses" SET "Cancelled" = true, "CancellationReason" = ${e.CancellationReason}, "CancelledAt" = ${e.CancelledAt}, "ReversalDate" = ${e.ReversalDate} WHERE "Id" = ${id}`;
      await new Finance(tx, a).cash(e.Id, e.AmountCents, "expense.reversal", e.CancellationReason);
      return out(e);
    });
  });

  r.get("/stock/movements", async ({ actor: a, query }) => {
    a.require("Owner", "Warehouse", "Accountant");
    const [pg, size] = paging(query, 50);
    const productId = queryGuid(query, "productId");
    const s = sql();
    const filter = productId ? s`AND "ProductId" = ${productId}` : s``;
    return page( s`SELECT count(*)::int AS n FROM "StockMovements" WHERE "ShopId" = ${a.shopId} ${filter}`,
      s`SELECT * FROM "StockMovements" WHERE "ShopId" = ${a.shopId} ${filter} ORDER BY "Date" DESC, "Id" OFFSET ${(pg - 1) * size} LIMIT ${size}`, pg, size);
  });
  r.get("/stock/adjustments", async ({ actor: a }) => {
    a.require("Owner", "Warehouse", "Accountant");
    const rows = await sql()`SELECT * FROM "StockMovements" WHERE "ShopId" = ${a.shopId} AND "Kind" = 'adjustment' ORDER BY "Date" DESC LIMIT 100`;
    return { items: rows.map((r: Row) => out(r)) };
  });
  r.post("/stock/adjustments", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner", "Warehouse");
    const body = In.obj(await ctx.body());
    const input = { productId: In.guid(body.productId), actual: In.dec(body.actual), expected: In.dec(body.expected), reason: In.str(body.reason) };
    return command(ctx, "stock.adjust", input, async (_shop, tx) => {
      const [p] = await tx`SELECT * FROM "Products" WHERE "ShopId" = ${a.shopId} AND "Id" = ${input.productId} AND NOT "Archived" FOR UPDATE`;
      if (!p) throw new ApiFault(404, "المنتج غير موجود.");
      Rules.quantity(input.actual, p.Unit === "كغم", true);
      if (!input.expected.eq(p.Stock)) throw new ApiFault(409, "تغير المخزون؛ أعد الجرد.");
      if (input.actual.gt(0) && input.actual.gt(p.Stock) && !p.CostKnown) throw new ApiFault(409, "سجّل شراء لتحديد تكلفة الصنف قبل زيادة رصيده بالجرد.");
      const reason = Rules.text(input.reason, 250);
      const difference = input.actual.minus(p.Stock);
      if (difference.isZero()) throw new ApiFault(400, "لا توجد فروق تحتاج تسوية.");
      const reference = uuid();
      await new Finance(tx, a).move(p, reference, difference, "adjustment", reason);
      return { id: reference, stock: p.Stock, difference, version: String(p.Version) };
    });
  });
  r.post("/stock/openings", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner");
    const body = In.obj(await ctx.body());
    const input = { productId: In.guid(body.productId), quantity: In.dec(body.quantity), unitCostCents: In.long(body.unitCostCents), reason: In.str(body.reason) };
    return command(ctx, "stock.opening", input, async (_shop, tx) => {
      const [product] = await tx`SELECT * FROM "Products" WHERE "Id" = ${input.productId} AND "ShopId" = ${a.shopId} AND NOT "Archived" FOR UPDATE`;
      if (!product) throw new ApiFault(404, "المنتج غير موجود.");
      const [moved] = await tx`SELECT 1 FROM "StockMovements" WHERE "ShopId" = ${a.shopId} AND "ProductId" = ${product.Id} LIMIT 1`;
      if (!product.Stock.isZero() || moved) throw new ApiFault(409, "الرصيد الافتتاحي مسموح قبل أول حركة فقط.");
      Rules.quantity(input.quantity, product.Unit === "كغم");
      Rules.cents(input.unitCostCents);
      product.AverageCostCents = D(input.unitCostCents);
      product.CostKnown = true;
      const reference = uuid();
      await new Finance(tx, a).move(product, reference, input.quantity, "opening", Rules.text(input.reason, 250));
      return { id: reference, stock: product.Stock, averageCostCents: product.AverageCostCents };
    });
  });

  r.get("/cash/summary", async ({ actor: a }) => {
    a.require("Owner", "Accountant");
    const [row] = await sql()`SELECT COALESCE(SUM("AmountCents") FILTER (WHERE "AmountCents" > 0), 0)::bigint AS i,
      COALESCE(SUM("AmountCents") FILTER (WHERE "AmountCents" < 0), 0)::bigint AS o, COALESCE(SUM("AmountCents"), 0)::bigint AS b
      FROM "CashEntries" WHERE "ShopId" = ${a.shopId}`;
    return { incomingCents: row.i, outgoingCents: -row.o, balanceCents: row.b, revision: String(a.shop!.Revision) };
  });
  r.get("/cash/entries", async ({ actor: a, query }) => {
    a.require("Owner", "Accountant");
    const [pg, size] = paging(query, 50);
    const s = sql();
    return page( s`SELECT count(*)::int AS n FROM "CashEntries" WHERE "ShopId" = ${a.shopId}`,
      s`SELECT * FROM "CashEntries" WHERE "ShopId" = ${a.shopId} ORDER BY "Date" DESC, "Id" OFFSET ${(pg - 1) * size} LIMIT ${size}`, pg, size);
  });
  r.post("/cash/entries", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner");
    const body = In.obj(await ctx.body());
    const input = { direction: In.str(body.direction), amountCents: In.long(body.amountCents), description: In.str(body.description) };
    return command(ctx, "cash.manual", input, async (_shop, tx) => {
      Rules.cents(input.amountCents, false);
      if (input.direction !== "in" && input.direction !== "out") throw new ApiFault(400, "اتجاه الحركة غير صالح.");
      const id = uuid();
      const delta = input.direction === "in" ? input.amountCents : -input.amountCents;
      const f = new Finance(tx, a);
      const balance = (await f.cashBalance()) + delta;
      await f.cash(id, delta, "manual", Rules.text(input.description, 250));
      return { id, balanceCents: balance, warning: balance < 0 ? "الرصيد المتوقع سالب." : null };
    });
  });
  r.get("/cash/reconciliations", async ({ actor: a }) => {
    a.require("Owner", "Accountant");
    const rows = await sql()`SELECT * FROM "CashChecks" WHERE "ShopId" = ${a.shopId} ORDER BY "Date" DESC LIMIT 100`;
    return { items: rows.map((r: Row) => out(r)) };
  });
  r.post("/cash/reconciliations", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner");
    const body = In.obj(await ctx.body());
    const input = { actualCents: In.long(body.actualCents), revision: In.str(body.revision), note: In.str(body.note) };
    return command(ctx, "cash.reconcile", input, async (shop, tx) => {
      Rules.cents(input.actualCents);
      if (input.revision !== String(shop.Revision)) throw new ApiFault(409, "تغير الصندوق؛ أعد تحميل الملخص.");
      const expected = await new Finance(tx, a).cashBalance();
      const difference = input.actualCents - expected;
      const note = difference === 0 ? Rules.optional(input.note) : Rules.text(input.note, 250);
      const check = { Id: uuid(), ShopId: a.shopId, UserId: a.userId, ExpectedCents: expected, ActualCents: input.actualCents, DifferenceCents: difference, Revision: Number(shop.Revision), Note: note, Date: new Date() };
      await tx`INSERT INTO "CashChecks" ${tx(check)}`;
      return out(check);
    });
  });

  mapSettings(r);
  mapReports(r);
}

function mapSettings(r: Router) {
  const sql = () => db();
  r.get("/settings", ({ actor: a }) => {
    a.merchantRead();
    const s = a.shop!;
    return { name: s.Name, owner: s.Owner, phone: s.Phone, address: s.Address, receiptNote: s.ReceiptNote, currency: "ILS", timeZone: "Asia/Hebron" };
  });
  r.patch("/settings", async (ctx) => {
    ctx.actor.require("Owner");
    const body = In.obj(await ctx.body());
    const input = { name: In.str(body.name), owner: In.str(body.owner), phone: In.str(body.phone), address: In.str(body.address), receiptNote: In.str(body.receiptNote) };
    return command(ctx, "settings.update", input, async (shop) => {
      shop.Name = Rules.text(input.name);
      shop.Owner = Rules.text(input.owner);
      shop.Phone = Rules.phone(input.phone);
      shop.Address = Rules.optional(input.address, 250);
      shop.ReceiptNote = Rules.optional(input.receiptNote, 250);
      return { name: shop.Name, owner: shop.Owner, phone: shop.Phone, address: shop.Address, receiptNote: shop.ReceiptNote };
    });
  });
  r.get("/employees", async ({ actor: a }) => {
    a.require("Owner");
    const rows = await sql()`SELECT "Id", "Name", "Phone", "Role", "Active" FROM "Users" WHERE "ShopId" = ${a.shopId}`;
    return { items: rows.map((r: Row) => out(r)) };
  });
  r.post("/employees", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner");
    const body = In.obj(await ctx.body());
    const input = { name: In.str(body.name), phone: In.str(body.phone), email: In.str(body.email), role: In.str(body.role), active: In.bool(body.active, true) };
    return command(ctx, "employee.create", input, async (_shop, tx) => {
      if (!["Cashier", "Warehouse", "Accountant"].includes(input.role ?? "")) throw new ApiFault(400, "دور الموظف غير صالح.");
      const u = { Id: uuid(), ShopId: a.shopId, Name: Rules.text(input.name), Phone: Rules.phone(input.phone), Email: "", PasswordHash: "", Role: input.role!, Active: input.active };
      await tx`INSERT INTO "Users" ${tx(u)}`;
      return { id: u.Id, name: u.Name, phone: u.Phone, role: u.Role, active: u.Active };
    });
  });
  r.patch("/employees/:id", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner");
    const id = ctx.params.id;
    const body = In.obj(await ctx.body());
    const input = { name: In.str(body.name), role: In.str(body.role), active: In.bool(body.active) };
    return command(ctx, "employee.update", { id, input }, async (_shop, tx) => {
      const [u] = await tx`SELECT * FROM "Users" WHERE "ShopId" = ${a.shopId} AND "Id" = ${id} AND "Role" <> 'Owner'`;
      if (!u) throw new ApiFault(404, "الموظف غير موجود أو هو المالك.");
      if (!["Cashier", "Warehouse", "Accountant"].includes(input.role ?? "")) throw new ApiFault(400, "الدور غير صالح.");
      const name = Rules.text(input.name);
      await tx`UPDATE "Users" SET "Name" = ${name}, "Role" = ${input.role}, "Active" = ${input.active} WHERE "Id" = ${id}`;
      if (!input.active) await tx`UPDATE "LoginSessions" SET "Active" = false WHERE "UserId" = ${id}`;
      return { id, name, role: input.role, active: input.active };
    });
  });
  r.get("/devices", async ({ actor: a }) => {
    a.require("Owner");
    const rows = await sql()`SELECT s."Id", s."UserId", s."DeviceName", s."Active", s."LastSeen", s."ExpiresAt" FROM "LoginSessions" s
      WHERE s."UserId" IN (SELECT "Id" FROM "Users" WHERE "ShopId" = ${a.shopId})`;
    return { items: rows.map((r: Row) => out(r)) };
  });
  r.post("/devices/:id/revoke", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner");
    const id = ctx.params.id;
    return command(ctx, "device.revoke", { id }, async (_shop, tx) => {
      const [s] = await tx`UPDATE "LoginSessions" SET "Active" = false WHERE "Id" = ${id} AND "UserId" IN (SELECT "Id" FROM "Users" WHERE "ShopId" = ${a.shopId}) RETURNING "Id"`;
      if (!s) throw new ApiFault(404, "الجهاز غير موجود.");
      return { id, active: false };
    });
  });
  r.get("/support/tickets", async ({ actor: a }) => {
    a.require("Owner");
    const rows = await sql()`SELECT * FROM "Tickets" WHERE "ShopId" = ${a.shopId} ORDER BY "Date" DESC LIMIT 100`;
    return { items: rows.map((r: Row) => out(r)) };
  });
  r.post("/support/tickets", async (ctx) => {
    const a = ctx.actor;
    a.require("Owner");
    const body = In.obj(await ctx.body());
    const input = { subject: In.str(body.subject), message: In.str(body.message) };
    return command(ctx, "ticket.create", input, async (_shop, tx) => {
      const t = { Id: uuid(), ShopId: a.shopId, Subject: Rules.text(input.subject), Message: Rules.text(input.message, 4000), Status: "open", Reply: "", Date: new Date() };
      await tx`INSERT INTO "Tickets" ${tx(t)}`;
      return out(t);
    });
  });
}

function mapReports(r: Router) {
  const sql = () => db();
  const range = (query: URLSearchParams) => {
    const from = queryDate(query, "from");
    const to = queryDate(query, "to");
    if (from && to && from > to) throw new ApiFault(400, "نطاق التواريخ غير صالح.");
    return { from, to };
  };

  r.get("/reports/summary", async ({ actor: a, query }) => {
    a.require("Owner", "Accountant");
    const { from, to } = range(query);
    const s = sql();
    const dates = (col: string) => s`${from ? s`AND ${s(col)} >= ${from}` : s``} ${to ? s`AND ${s(col)} <= ${to}` : s``}`;
    const [inv] = await s`SELECT
        COALESCE(SUM("TotalCents") FILTER (WHERE "Kind" = 'sale'), 0)::bigint AS sales,
        COALESCE(SUM("CostCents") FILTER (WHERE "Kind" = 'sale'), 0)::bigint AS costs,
        COALESCE(SUM("TotalCents") FILTER (WHERE "Kind" = 'purchase'), 0)::bigint AS purchases,
        count(*) FILTER (WHERE "Kind" = 'sale' AND NOT "CostComplete")::int AS uncosted
      FROM "Invoices" WHERE "ShopId" = ${a.shopId} ${dates("Date")}`;
    const [exp] = await s`SELECT COALESCE(SUM("AmountCents"), 0)::bigint AS t FROM "Expenses" WHERE "ShopId" = ${a.shopId} ${dates("Date")}`;
    const [rev] = await s`SELECT COALESCE(SUM("AmountCents"), 0)::bigint AS t FROM "Expenses" WHERE "ShopId" = ${a.shopId} AND "ReversalDate" IS NOT NULL ${dates("ReversalDate")}`;
    const adjustments = await s`SELECT "Quantity", "UnitCostCents", "CostKnown" FROM "StockMovements" WHERE "ShopId" = ${a.shopId} AND "Kind" = 'adjustment' ${dates("BusinessDate")}`;
    const [ret] = await s`SELECT
        COALESCE(SUM("TotalCents") FILTER (WHERE "Kind" = 'sale.return'), 0)::bigint AS st,
        COALESCE(SUM("CostCents") FILTER (WHERE "Kind" = 'sale.return'), 0)::bigint AS sc,
        COALESCE(SUM("TotalCents") FILTER (WHERE "Kind" = 'purchase.return'), 0)::bigint AS pt,
        COALESCE(SUM("CostCents") FILTER (WHERE "Kind" = 'purchase.return'), 0)::bigint AS pc,
        count(*) FILTER (WHERE NOT "CostComplete")::int AS uncosted
      FROM "InvoiceReturns" WHERE "ShopId" = ${a.shopId} ${dates("Date")}`;
    const expenseTotal = exp.t - rev.t;
    const adjustmentValue = adjustments.reduce((sum: number, e: Row) => checked(sum + round(e.Quantity.times(e.UnitCostCents)).toNumber()), 0);
    const uncostedAdjustments = adjustments.filter((e: Row) => !e.CostKnown).length;
    const netSales = inv.sales - ret.st;
    const netCosts = inv.costs - ret.sc;
    const variance = ret.pt - ret.pc;
    const uncertain = inv.uncosted > 0 || ret.uncosted > 0;
    return {
      salesCents: netSales, grossSalesCents: inv.sales, saleReturnsCents: ret.st, purchasesCents: inv.purchases - ret.pt, grossPurchasesCents: inv.purchases,
      purchaseReturnsCents: ret.pt, purchaseReturnVarianceCents: variance, expensesCents: expenseTotal, recordedCostOfGoodsCents: netCosts,
      uncostedInvoices: inv.uncosted, uncostedReturns: ret.uncosted, grossProfitCents: uncertain ? null : netSales - netCosts,
      inventoryAdjustmentValueCents: adjustmentValue, uncostedAdjustments,
      operatingProfitCents: uncertain || uncostedAdjustments > 0 ? null : netSales - netCosts - expenseTotal + adjustmentValue + variance,
    };
  });

  r.get("/reports/daily-sales", async ({ actor: a, query }) => {
    a.require("Owner", "Accountant");
    const { from, to } = range(query);
    const start = from ?? addDays(Rules.today(), -30);
    const end = to ?? Rules.today();
    if (dayNumber(end) - dayNumber(start) > 366) throw new ApiFault(400, "اختر فترة لا تتجاوز سنة.");
    const s = sql();
    const sales = await s`SELECT "Date", SUM("TotalCents")::bigint AS t, count(*)::int AS c FROM "Invoices"
      WHERE "ShopId" = ${a.shopId} AND "Kind" = 'sale' AND "Date" >= ${start} AND "Date" <= ${end} GROUP BY "Date"`;
    const returns = await s`SELECT "Date", SUM("TotalCents")::bigint AS t, count(*)::int AS c FROM "InvoiceReturns"
      WHERE "ShopId" = ${a.shopId} AND "Kind" = 'sale.return' AND "Date" >= ${start} AND "Date" <= ${end} GROUP BY "Date"`;
    const sm = new Map<string, Row>(sales.map((x: Row) => [x.Date, x]));
    const rm = new Map<string, Row>(returns.map((x: Row) => [x.Date, x]));
    const days = [...new Set<string>([...sm.keys(), ...rm.keys()])].sort();
    return {
      items: days.map((date) => ({
        date, totalCents: (sm.get(date)?.t ?? 0) - (rm.get(date)?.t ?? 0), count: sm.get(date)?.c ?? 0, returnCents: rm.get(date)?.t ?? 0, returnCount: rm.get(date)?.c ?? 0,
      })),
    };
  });

  r.get("/audit", async ({ actor: a, query }) => {
    a.require("Owner", "Accountant");
    const [pg, size] = paging(query, 50);
    const s = sql();
    return page( s`SELECT count(*)::int AS n FROM "Audits" WHERE "ShopId" = ${a.shopId}`,
      s`SELECT * FROM "Audits" WHERE "ShopId" = ${a.shopId} ORDER BY "Date" DESC OFFSET ${(pg - 1) * size} LIMIT ${size}`, pg, size);
  });
}

export type { Ctx };
