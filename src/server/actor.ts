import "server-only";
import { db, type Db } from "./db";
import { ApiFault, Rules, addDays } from "./rules";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

export class Actor {
  user: Row | null = null;
  shop: Row | null = null;
  session: Row | null = null;

  get userId(): string {
    if (!this.user) throw new ApiFault(401, "سجّل الدخول.");
    return this.user.Id;
  }
  get shopId(): string {
    if (!this.shop) throw new ApiFault(403, "الحساب ليس حساب بقالة.");
    return this.shop.Id;
  }
  get role(): string {
    return this.user?.Role ?? "";
  }
  get seesCost() {
    return this.role !== "Cashier";
  }

  async load(sid: string): Promise<boolean> {
    const sql = db();
    const [session] = await sql`SELECT * FROM "LoginSessions" WHERE "Id" = ${sid} AND "Active" AND "ExpiresAt" > now()`;
    if (!session) return false;
    const [user] = await sql`SELECT * FROM "Users" WHERE "Id" = ${session.UserId} AND "Active"`;
    if (!user) return false;
    let shop: Row | undefined;
    if (user.ShopId) [shop] = await sql`SELECT * FROM "Shops" WHERE "Id" = ${user.ShopId}`;
    if ((session.LastSeen as Date).getTime() < Date.now() - 5 * 60_000) {
      session.LastSeen = new Date();
      await sql`UPDATE "LoginSessions" SET "LastSeen" = ${session.LastSeen} WHERE "Id" = ${sid}`;
    }
    this.session = session;
    this.user = user;
    this.shop = shop ?? null;
    return !user.ShopId || !!shop;
  }

  require(...roles: string[]) {
    if (!this.user) throw new ApiFault(401, "سجّل الدخول.");
    if (!roles.includes(this.user.Role)) throw new ApiFault(403, "ليس لديك صلاحية لهذه العملية.");
  }

  merchantRead() {
    this.require("Owner", "Cashier", "Warehouse", "Accountant");
    void this.shopId;
  }

  async checkSubscription() {
    if (!this.shop) return;
    if (!(await subscriptionOpen(db(), this.shop))) throw new ApiFault(403, "البقالة معلقة أو اشتراكها منتهٍ. تواصل مع الإدارة.");
  }
}

export async function graceDays(sql: Db): Promise<number> {
  const [row] = await sql`SELECT "GraceDays" FROM "PlatformSettings" ORDER BY "Id" LIMIT 1`;
  return row?.GraceDays ?? 0;
}
export async function subscriptionOpen(sql: Db, shop: Row) {
  return !shop.Suspended && addDays(shop.ExpiresOn, await graceDays(sql)) >= Rules.today();
}
