import "server-only";
import { db, type Db } from "../db";
import type { Actor, Row } from "../actor";
import { command } from "../commands";
import { In, paging, queryGuid, type Json } from "../input";
import { hashPassword } from "../password";
import { ApiFault, Rules, out, uuid } from "../rules";
import { noContent, type Router } from "../http";
import { page } from "./merchant";

const like = (q: string) => "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
const read = (a: Actor) => a.require("PlatformAdmin", "Support", "Billing");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function shopDto(s: Row) {
  return {
    id: s.Id, version: String(s.Revision), name: s.Name, owner: s.Owner, phone: s.Phone, planId: s.PlanId, expiresOn: s.ExpiresOn,
    status: s.Suspended ? "suspended" : s.ExpiresOn < Rules.today() ? "overdue" : "active", suspensionReason: s.SuspensionReason,
  };
}
async function audit(sql: Db, a: Actor, action: string, shop: string | null = null) {
  await sql`INSERT INTO "Audits" ("Id", "ShopId", "UserId", "Action", "Date") VALUES (${uuid()}, ${shop}, ${a.userId}, ${action}, now())`;
}
function readShop(body: Json) {
  return { name: In.str(body.name), owner: In.str(body.owner), phone: In.str(body.phone), planId: In.guid(body.planId), expiresOn: In.date(body.expiresOn) };
}
function readPlan(body: Json) {
  return { name: In.str(body.name), priceCents: In.long(body.priceCents), months: In.int(body.months), devices: In.int(body.devices), active: In.bool(body.active, true) };
}
function applyPlan(p: Row, i: ReturnType<typeof readPlan>) {
  Rules.cents(i.priceCents);
  if (i.months < 1 || i.months > 36 || i.devices < 1 || i.devices > 100) throw new ApiFault(400, "راجع مدة الخطة وحد الأجهزة.");
  p.Name = Rules.text(i.name, 100);
  p.PriceCents = i.priceCents;
  p.Months = i.months;
  p.Devices = i.devices;
  p.Active = i.active;
}

export function mapAdmin(r: Router) {
  const sql = () => db();

  r.get("/admin/summary", async ({ actor: a }) => {
    a.require("PlatformAdmin", "Billing");
    const today = Rules.today();
    const [x] = await sql()`SELECT
      (SELECT count(*)::int FROM "Shops") AS shops,
      (SELECT count(*)::int FROM "Shops" WHERE "ExpiresOn" < ${today}) AS overdue,
      (SELECT count(*)::int FROM "Shops" WHERE "Suspended") AS suspended,
      (SELECT COALESCE(SUM("AmountCents"), 0)::bigint FROM "SubscriptionPayments") AS payments,
      (SELECT count(*)::int FROM "Tickets" WHERE "Status" = 'open') AS tickets`;
    return { shops: x.shops, overdue: x.overdue, suspended: x.suspended, paymentsCents: x.payments, openTickets: x.tickets };
  });

  r.get("/admin/shops", async ({ actor: a, query }) => {
    read(a);
    const [pg, size] = paging(query);
    const q = query.get("q")?.trim() ? query.get("q")! : null;
    const status = query.get("status");
    const today = Rules.today();
    const s = sql();
    const where = s`TRUE ${q ? s`AND ("Name" LIKE ${like(q)} OR "Owner" LIKE ${like(q)} OR "Phone" LIKE ${like(q)})` : s``}
      ${status === "suspended" ? s`AND "Suspended"` : status === "overdue" ? s`AND NOT "Suspended" AND "ExpiresOn" < ${today}` : status === "active" ? s`AND NOT "Suspended" AND "ExpiresOn" >= ${today}` : s``}`;
    return page(s`SELECT count(*)::int AS n FROM "Shops" WHERE ${where}`,
      s`SELECT * FROM "Shops" WHERE ${where} ORDER BY "Name", "Id" OFFSET ${(pg - 1) * size} LIMIT ${size}`, pg, size, shopDto);
  });

  r.post("/admin/shops", async (ctx) => {
    const a = ctx.actor;
    a.require("PlatformAdmin");
    const input = readShop(In.obj(await ctx.body()));
    return db().begin(async (tx: Db) => {
      const [plan] = await tx`SELECT 1 FROM "Plans" WHERE "Id" = ${input.planId} AND "Active"`;
      if (!plan || !input.expiresOn) throw new ApiFault(400, "اختر خطة متاحة وتاريخ انتهاء صالحًا.");
      const shop = {
        Id: uuid(), Name: Rules.text(input.name), Owner: Rules.text(input.owner), Phone: Rules.phone(input.phone), Address: "", ReceiptNote: "شكرًا لزيارتكم",
        PlanId: input.planId, ExpiresOn: input.expiresOn, Suspended: false, SuspensionReason: "", Revision: 0, CreatedAt: new Date(),
      };
      await tx`INSERT INTO "Shops" ${tx(shop)}`;
      await tx`INSERT INTO "Users" ${tx({ Id: uuid(), ShopId: shop.Id, Name: shop.Owner, Phone: shop.Phone, Email: "", PasswordHash: "", Role: "Owner", Active: true })}`;
      await audit(tx, a, "shop.create", shop.Id);
      return shopDto(shop);
    });
  });

  r.patch("/admin/shops/:id", async (ctx) => {
    const a = ctx.actor;
    a.require("PlatformAdmin");
    const id = ctx.params.id;
    const input = readShop(In.obj(await ctx.body()));
    return command(ctx, "shop.update", { id, input }, async (shop, tx) => {
      const [plan] = await tx`SELECT 1 FROM "Plans" WHERE "Id" = ${input.planId} AND ("Active" OR "Id" = ${shop.PlanId})`;
      if (!plan) throw new ApiFault(400, "الخطة غير متاحة.");
      // Subscription dates change only through a recorded renewal, never silent edits.
      if (input.expiresOn !== shop.ExpiresOn) throw new ApiFault(400, "غيّر تاريخ الاشتراك من تسجيل دفعة تجديد.");
      shop.Name = Rules.text(input.name);
      shop.Owner = Rules.text(input.owner);
      shop.Phone = Rules.phone(input.phone);
      shop.PlanId = input.planId;
      const owners = await tx`UPDATE "Users" SET "Name" = ${shop.Owner}, "Phone" = ${shop.Phone} WHERE "ShopId" = ${id} AND "Role" = 'Owner' RETURNING "Id"`;
      if (owners.length !== 1) throw new ApiFault(500, "تعذر إكمال الطلب.");
      return shopDto(shop);
    }, id);
  });

  r.post("/admin/shops/:id/suspend", async (ctx) => {
    ctx.actor.require("PlatformAdmin");
    const id = ctx.params.id;
    const input = { reason: In.str(In.obj(await ctx.body()).reason) };
    return command(ctx, "shop.suspend", { id, input }, async (shop) => {
      shop.Suspended = true;
      shop.SuspensionReason = Rules.text(input.reason, 250);
      return shopDto(shop);
    }, id);
  });
  r.post("/admin/shops/:id/activate", async (ctx) => {
    ctx.actor.require("PlatformAdmin");
    const id = ctx.params.id;
    return command(ctx, "shop.activate", { id }, async (shop) => {
      shop.Suspended = false;
      shop.SuspensionReason = "";
      return shopDto(shop);
    }, id);
  });

  r.get("/admin/plans", async ({ actor: a }) => {
    read(a);
    const items = (await sql()`SELECT * FROM "Plans" ORDER BY "PriceCents"`).map((p: Row) => out(p));
    return { items, page: 1, pageSize: items.length, total: items.length };
  });
  r.post("/admin/plans", async (ctx) => {
    const a = ctx.actor;
    a.require("PlatformAdmin");
    const input = readPlan(In.obj(await ctx.body()));
    const p: Row = { Id: uuid() };
    applyPlan(p, input);
    await db().begin(async (tx: Db) => {
      await tx`INSERT INTO "Plans" ${tx(p)}`;
      await audit(tx, a, "plan.create");
    });
    return out(p);
  });
  r.patch("/admin/plans/:id", async (ctx) => {
    const a = ctx.actor;
    a.require("PlatformAdmin");
    const input = readPlan(In.obj(await ctx.body()));
    return db().begin(async (tx: Db) => {
      const [p] = await tx`SELECT * FROM "Plans" WHERE "Id" = ${ctx.params.id} FOR UPDATE`;
      if (!p) throw new ApiFault(404, "الخطة غير موجودة.");
      applyPlan(p, input);
      await tx`UPDATE "Plans" SET "Name" = ${p.Name}, "PriceCents" = ${p.PriceCents}, "Months" = ${p.Months}, "Devices" = ${p.Devices}, "Active" = ${p.Active} WHERE "Id" = ${p.Id}`;
      await audit(tx, a, "plan.update");
      return out(p);
    });
  });

  r.get("/admin/subscription-payments", async ({ actor: a, query }) => {
    a.require("PlatformAdmin", "Billing");
    const [pg, size] = paging(query, 50);
    const shopId = queryGuid(query, "shopId");
    const s = sql();
    const where = shopId ? s`WHERE "ShopId" = ${shopId}` : s``;
    return page(s`SELECT count(*)::int AS n FROM "SubscriptionPayments" ${where}`,
      s`SELECT * FROM "SubscriptionPayments" ${where} ORDER BY "Date" DESC OFFSET ${(pg - 1) * size} LIMIT ${size}`, pg, size);
  });
  r.post("/admin/subscription-payments", async (ctx) => {
    const a = ctx.actor;
    a.require("PlatformAdmin", "Billing");
    const body = In.obj(await ctx.body());
    const input = { shopId: In.guid(body.shopId), amountCents: In.long(body.amountCents), reference: In.str(body.reference), expiresOn: In.date(body.expiresOn) };
    return command(ctx, "subscription.renew", input, async (shop, tx) => {
      Rules.cents(input.amountCents, false);
      if (!input.expiresOn || input.expiresOn <= shop.ExpiresOn || input.expiresOn < Rules.today())
        throw new ApiFault(400, "تاريخ التجديد يجب أن يلي التاريخ السابق وليس في الماضي.");
      const p = {
        Id: uuid(), ShopId: shop.Id, UserId: a.userId, AmountCents: input.amountCents, Reference: Rules.text(input.reference, 150),
        PreviousExpiry: shop.ExpiresOn, ExpiresOn: input.expiresOn, Date: new Date(),
      };
      await tx`INSERT INTO "SubscriptionPayments" ${tx(p)}`;
      shop.ExpiresOn = input.expiresOn;
      return { payment: out(p), shop: shopDto(shop) };
    }, input.shopId);
  });

  r.get("/admin/support/tickets", async ({ actor: a, query }) => {
    a.require("PlatformAdmin", "Support");
    const status = query.get("status")?.trim() ? query.get("status") : null;
    const s = sql();
    const rows = await s`SELECT * FROM "Tickets" ${status ? s`WHERE "Status" = ${status}` : s``} ORDER BY "Date" DESC LIMIT 100`;
    return { items: rows.map((t: Row) => out(t)) };
  });
  r.patch("/admin/support/tickets/:id", async (ctx) => {
    const a = ctx.actor;
    a.require("PlatformAdmin", "Support");
    const body = In.obj(await ctx.body());
    const input = { reply: In.str(body.reply), status: In.str(body.status) };
    return db().begin(async (tx: Db) => {
      const [t] = await tx`SELECT * FROM "Tickets" WHERE "Id" = ${ctx.params.id} FOR UPDATE`;
      if (!t) throw new ApiFault(404, "الطلب غير موجود.");
      if (input.status !== "open" && input.status !== "closed") throw new ApiFault(400, "الحالة غير صالحة.");
      t.Reply = Rules.text(input.reply, 4000);
      t.Status = input.status;
      await tx`UPDATE "Tickets" SET "Reply" = ${t.Reply}, "Status" = ${t.Status} WHERE "Id" = ${t.Id}`;
      await audit(tx, a, "ticket.reply", t.ShopId);
      return out(t);
    });
  });

  r.get("/admin/users", async ({ actor: a }) => {
    a.require("PlatformAdmin");
    const rows = await sql()`SELECT "Id", "Name", "Phone", "Email", "Role", "Active" FROM "Users" WHERE "ShopId" IS NULL`;
    return { items: rows.map((u: Row) => out(u)) };
  });
  r.post("/admin/users", async (ctx) => {
    const a = ctx.actor;
    a.require("PlatformAdmin");
    const body = In.obj(await ctx.body());
    const input = { name: In.str(body.name), phone: In.str(body.phone), email: In.str(body.email), role: In.str(body.role) ?? "", password: In.str(body.password) };
    if (!Rules.isPlatform(input.role) || input.password === null || input.password.length < 12)
      throw new ApiFault(400, "دور الإدارة غير صالح أو كلمة المرور أقل من12 حرفًا.");
    const email = Rules.text(input.email).toLowerCase();
    if (!EMAIL.test(email)) throw new ApiFault(400, "البريد غير صالح.");
    const u = { Id: uuid(), ShopId: null, Name: Rules.text(input.name), Phone: Rules.phone(input.phone), Email: email, PasswordHash: hashPassword(input.password), Role: input.role, Active: true };
    await db().begin(async (tx: Db) => {
      await tx`INSERT INTO "Users" ${tx(u)}`;
      await audit(tx, a, "platform-user.create");
    });
    return { id: u.Id, name: u.Name, email: u.Email, role: u.Role, active: u.Active };
  });
  r.patch("/admin/users/:id", async (ctx) => {
    const a = ctx.actor;
    a.require("PlatformAdmin");
    const id = ctx.params.id;
    const body = In.obj(await ctx.body());
    const input = { name: In.str(body.name), role: In.str(body.role) ?? "", active: In.bool(body.active) };
    if (id === a.userId || !Rules.isPlatform(input.role)) throw new ApiFault(400, "لا يمكنك تعطيل أو تغيير دور حسابك الحالي.");
    return db().begin(async (tx: Db) => {
      const [u] = await tx`SELECT * FROM "Users" WHERE "Id" = ${id} AND "ShopId" IS NULL FOR UPDATE`;
      if (!u) throw new ApiFault(404, "المستخدم غير موجود.");
      if (u.Role === "PlatformAdmin" && (!input.active || input.role !== "PlatformAdmin")) {
        const [other] = await tx`SELECT 1 FROM "Users" WHERE "Id" <> ${id} AND "Role" = 'PlatformAdmin' AND "Active" LIMIT 1`;
        if (!other) throw new ApiFault(409, "يجب إبقاء مدير نظام نشط.");
      }
      const name = Rules.text(input.name);
      await tx`UPDATE "Users" SET "Name" = ${name}, "Role" = ${input.role}, "Active" = ${input.active} WHERE "Id" = ${id}`;
      if (!input.active) await tx`UPDATE "LoginSessions" SET "Active" = false WHERE "UserId" = ${id}`;
      await audit(tx, a, "platform-user.update");
      return { id, name, role: input.role, active: input.active };
    });
  });

  r.get("/admin/devices", async ({ actor: a, query }) => {
    a.require("PlatformAdmin", "Support");
    const shopId = queryGuid(query, "shopId");
    const s = sql();
    const rows = await s`SELECT s."Id", s."UserId", u."ShopId", s."DeviceName", s."LastSeen", s."Active", s."ExpiresAt"
      FROM "LoginSessions" s JOIN "Users" u ON u."Id" = s."UserId"
      WHERE u."ShopId" IS NOT NULL ${shopId ? s`AND u."ShopId" = ${shopId}` : s``} ORDER BY s."LastSeen" DESC LIMIT 100`;
    return { items: rows.map((d: Row) => out(d)) };
  });
  r.post("/admin/devices/:id/revoke", async (ctx) => {
    const a = ctx.actor;
    a.require("PlatformAdmin", "Support");
    await db().begin(async (tx: Db) => {
      const [session] = await tx`SELECT s."Id", u."ShopId" FROM "LoginSessions" s JOIN "Users" u ON u."Id" = s."UserId" WHERE s."Id" = ${ctx.params.id}`;
      if (!session) throw new ApiFault(404, "الجهاز غير موجود.");
      if (!session.ShopId) throw new ApiFault(403, "هذا ليس جهاز بقالة.");
      await tx`UPDATE "LoginSessions" SET "Active" = false WHERE "Id" = ${session.Id}`;
      await audit(tx, a, "device.revoke", session.ShopId);
    });
    return noContent();
  });

  r.get("/admin/audit", async ({ actor: a, query }) => {
    a.require("PlatformAdmin");
    const [pg, size] = paging(query, 50);
    const s = sql();
    return page(s`SELECT count(*)::int AS n FROM "Audits"`, s`SELECT * FROM "Audits" ORDER BY "Date" DESC OFFSET ${(pg - 1) * size} LIMIT ${size}`, pg, size);
  });

  r.get("/admin/settings", async ({ actor: a }) => {
    a.require("PlatformAdmin");
    const [s] = await sql()`SELECT * FROM "PlatformSettings" ORDER BY "Id" LIMIT 1`;
    if (!s) throw new ApiFault(500, "تعذر إكمال الطلب.");
    return out(s);
  });
  r.patch("/admin/settings", async (ctx) => {
    const a = ctx.actor;
    a.require("PlatformAdmin");
    const body = In.obj(await ctx.body());
    const input = { name: In.str(body.name), phone: In.str(body.phone), email: In.str(body.email), graceDays: In.int(body.graceDays) };
    if (input.graceDays < 0 || input.graceDays > 90) throw new ApiFault(400, "مهلة السماح بين0 و90 يومًا.");
    return db().begin(async (tx: Db) => {
      const [s] = await tx`SELECT * FROM "PlatformSettings" ORDER BY "Id" LIMIT 1 FOR UPDATE`;
      if (!s) throw new ApiFault(500, "تعذر إكمال الطلب.");
      Object.assign(s, { Name: Rules.text(input.name), Phone: Rules.optional(input.phone, 30), Email: Rules.optional(input.email, 150), GraceDays: input.graceDays });
      await tx`UPDATE "PlatformSettings" SET "Name" = ${s.Name}, "Phone" = ${s.Phone}, "Email" = ${s.Email}, "GraceDays" = ${s.GraceDays} WHERE "Id" = ${s.Id}`;
      await audit(tx, a, "platform-settings.update");
      return out(s);
    });
  });
}
