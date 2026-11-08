import "server-only";
import { db, type Db } from "./db";
import type { Row } from "./actor";
import type { Ctx } from "./http";
import { RawJson } from "./http";
import { ApiFault, Rules, uuid } from "./rules";
import { stringify } from "./lines";

/**
 * Idempotent, serialized shop command: locks the shop row, replays a stored response for a
 * repeated Idempotency-Key, bumps the shop revision and audits the operation.
 */
export async function command(
  ctx: Ctx,
  operation: string,
  input: unknown,
  action: (shop: Row, tx: Db) => Promise<unknown>,
  explicitShop?: string,
): Promise<RawJson> {
  const actor = ctx.actor;
  const shopId = explicitShop ?? actor.shopId;
  const key = ctx.req.headers.get("idempotency-key") ?? "";
  if (key.length < 8 || key.length > 128) throw new ApiFault(400, "أرسل Idempotency-Key ثابتًا لكل عملية (8–128 حرفًا).");
  const hash = Rules.hash(actor.userId + "|" + actor.role + "|" + operation + stringify(input));
  const json = await db().begin(async (tx: Db) => {
    const [shop] = await tx`SELECT * FROM "Shops" WHERE "Id" = ${shopId} FOR UPDATE`;
    if (!shop) throw new ApiFault(404, "البقالة غير موجودة.");
    const [prior] = await tx`SELECT "Operation", "RequestHash", "ResponseJson" FROM "CommandRecords" WHERE "ShopId" = ${shopId} AND "Key" = ${key}`;
    if (prior) {
      if (prior.Operation !== operation || prior.RequestHash !== hash) throw new ApiFault(409, "هذا المفتاح مستخدم لطلب مختلف.");
      return prior.ResponseJson as string;
    }
    const result = await action(shop, tx);
    shop.Revision = Number(shop.Revision) + 1;
    await tx`UPDATE "Shops" SET "Name" = ${shop.Name}, "Owner" = ${shop.Owner}, "Phone" = ${shop.Phone}, "Address" = ${shop.Address},
      "ReceiptNote" = ${shop.ReceiptNote}, "PlanId" = ${shop.PlanId}, "ExpiresOn" = ${shop.ExpiresOn}, "Suspended" = ${shop.Suspended},
      "SuspensionReason" = ${shop.SuspensionReason}, "Revision" = ${shop.Revision} WHERE "Id" = ${shopId}`;
    const text = stringify(result);
    await tx`INSERT INTO "CommandRecords" ("Id", "ShopId", "Key", "Operation", "RequestHash", "ResponseJson", "Date")
      VALUES (${uuid()}, ${shopId}, ${key}, ${operation}, ${hash}, ${text}::jsonb, now())`;
    await tx`INSERT INTO "Audits" ("Id", "ShopId", "UserId", "Action", "Date") VALUES (${uuid()}, ${shopId}, ${actor.userId}, ${operation + " [" + key + "]"}, now())`;
    return text;
  });
  return new RawJson(json);
}
