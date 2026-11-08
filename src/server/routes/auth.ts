import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { db, type Db } from "../db";
import type { Row } from "../actor";
import { subscriptionOpen } from "../actor";
import { In } from "../input";
import { hashPassword, verifyPassword } from "../password";
import { ApiFault, Rules, uuid } from "../rules";
import { CSRF_COOKIE, SESSION_COOKIE, clearCookie, cookie, randomToken, readCookie, sign } from "../security";
import { csrfToken, noContent, type Ctx, type Router } from "../http";

/** Shows OTP codes in API responses: only for local development, or an explicitly insecure demo. */
export function exposeOtpCode() {
  if (process.env.OTP_EXPOSE_DEVELOPMENT_CODE !== "true") return false;
  return process.env.NODE_ENV !== "production" || process.env.OTP_ALLOW_INSECURE_DEMO_CODE === "true";
}

function newSession(user: Row, device: unknown) {
  const name = Rules.optional(In.str(device), 100);
  const now = new Date();
  return { Id: uuid(), UserId: user.Id, DeviceName: name.length > 0 ? name : "جهاز ويب", Active: true, CreatedAt: now, LastSeen: now, ExpiresAt: new Date(now.getTime() + 7 * 86_400_000) };
}
async function insertSession(sql: Db, s: ReturnType<typeof newSession>) {
  await sql`INSERT INTO "LoginSessions" ("Id", "UserId", "DeviceName", "Active", "CreatedAt", "LastSeen", "ExpiresAt")
    VALUES (${s.Id}, ${s.UserId}, ${s.DeviceName}, true, ${s.CreatedAt}, ${s.LastSeen}, ${s.ExpiresAt})`;
}
function signIn(ctx: Ctx, session: ReturnType<typeof newSession>) {
  ctx.setCookies.push(cookie(SESSION_COOKIE, `${session.Id}.${sign("session", session.Id)}`, { expires: session.ExpiresAt }));
}

class Deferred extends Error {
  constructor(public fault: ApiFault) {
    super(fault.message);
  }
}

export function mapAuth(r: Router) {
  r.get(
    "/auth/csrf",
    (ctx) => {
      let value = readCookie(ctx.req.headers.get("cookie"), CSRF_COOKIE);
      if (!value || value.length < 32) {
        value = randomToken();
        ctx.setCookies.push(cookie(CSRF_COOKIE, value));
      }
      return { token: csrfToken(value, ctx.actor.user ? ctx.actor.userId : null) };
    },
    { anonymous: true },
  );

  r.post(
    "/auth/otp",
    async (ctx) => {
      const input = In.obj(await ctx.body());
      const phone = Rules.phone(In.str(input.phone));
      const sql = db();
      const [recent] = await sql`SELECT 1 FROM "OtpChallenges" WHERE "Phone" = ${phone} AND "CreatedAt" > now() - interval '60 seconds' LIMIT 1`;
      if (recent) throw new ApiFault(429, "انتظر دقيقة قبل طلب رمز جديد.");
      const development = exposeOtpCode();
      const smsUrl = process.env.OTP_PROVIDER_URL ?? "";
      let validUrl = false;
      try {
        validUrl = new URL(smsUrl).protocol === "https:";
      } catch {}
      if (!development && !validUrl) throw new ApiFault(503, "مزوّد رسائل التحقق غير مهيأ.");
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const id = uuid();
      await sql`INSERT INTO "OtpChallenges" ("Id", "Phone", "CodeHash", "Attempts", "Used", "CreatedAt", "ExpiresAt")
        VALUES (${id}, ${phone}, ${Rules.hash(id + ":" + code)}, 0, false, now(), now() + interval '5 minutes')`;
      const [known] = await sql`SELECT 1 FROM "Users" WHERE "Phone" = ${phone} AND "ShopId" IS NOT NULL AND "Active" LIMIT 1`;
      if (!development && known) {
        const response = await fetch(smsUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OTP_PROVIDER_TOKEN ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ phone, code }),
          signal: AbortSignal.timeout(15_000),
        }).catch(() => null);
        if (!response?.ok) throw new ApiFault(503, "تعذر إرسال الرمز. حاول لاحقًا.");
      }
      return { challengeId: id, expiresInSeconds: 300, developmentCode: development ? code : null };
    },
    { anonymous: true, limit: true },
  );

  r.post(
    "/auth/verify",
    async (ctx) => {
      const input = In.obj(await ctx.body());
      const challengeId = In.guid(input.challengeId);
      const supplied = In.str(input.code) ?? "";
      try {
        const { user, session } = await db().begin(async (tx: Db) => {
          const [c] = await tx`SELECT * FROM "OtpChallenges" WHERE "Id" = ${challengeId} FOR UPDATE`;
          if (!c || c.Used || c.Attempts >= 5 || (c.ExpiresAt as Date).getTime() < Date.now()) throw new ApiFault(400, "الرمز غير صالح أو انتهى.");
          await tx`UPDATE "OtpChallenges" SET "Attempts" = "Attempts" + 1 WHERE "Id" = ${c.Id}`;
          const expected = Buffer.from(c.CodeHash, "hex");
          const actual = Buffer.from(Rules.hash(c.Id + ":" + supplied), "hex");
          // The failed attempt must be committed, so the fault is raised after the transaction.
          if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { fault: new ApiFault(400, "الرمز غير صالح أو انتهى.") };
          const [user] = await tx`SELECT * FROM "Users" WHERE "Phone" = ${c.Phone} AND "ShopId" IS NOT NULL AND "Active"`;
          if (!user) {
            await tx`UPDATE "OtpChallenges" SET "Used" = true WHERE "Id" = ${c.Id}`;
            return { fault: new ApiFault(400, "تعذر تسجيل الدخول.") };
          }
          const [shop] = await tx`SELECT * FROM "Shops" WHERE "Id" = ${user.ShopId} FOR UPDATE`;
          if (!(await subscriptionOpen(tx, shop))) throw new ApiFault(403, "اشتراك البقالة غير متاح. تواصل مع الإدارة.");
          const [{ Devices: limit }] = await tx`SELECT "Devices" FROM "Plans" WHERE "Id" = ${shop.PlanId}`;
          const [{ n }] = await tx`SELECT count(*)::int AS n FROM "LoginSessions" s JOIN "Users" u ON u."Id" = s."UserId"
            WHERE u."ShopId" = ${shop.Id} AND u."Active" AND s."Active" AND s."ExpiresAt" > now()`;
          if (n >= limit) throw new ApiFault(409, "وصلت البقالة إلى حد الأجهزة. اسحب جلسة قديمة من حساب المالك.");
          await tx`UPDATE "OtpChallenges" SET "Used" = true WHERE "Id" = ${c.Id}`;
          const session = newSession(user, input.deviceName);
          await insertSession(tx, session);
          return { user, session };
        }).then((result: { fault?: ApiFault; user?: Row; session?: ReturnType<typeof newSession> }) => {
          if (result.fault) throw new Deferred(result.fault);
          return result as { user: Row; session: ReturnType<typeof newSession> };
        });
        signIn(ctx, session);
        return { userId: user.Id, shopId: user.ShopId, roles: [user.Role], sessionId: session.Id };
      } catch (e) {
        if (e instanceof Deferred) throw e.fault;
        throw e;
      }
    },
    { anonymous: true, limit: true },
  );

  r.post(
    "/auth/admin-login",
    async (ctx) => {
      const input = In.obj(await ctx.body());
      const email = (In.str(input.email) ?? "").trim().toLowerCase();
      const password = In.str(input.password) ?? "";
      if (password.length > 256 || email.length > 150) throw new ApiFault(401, "بيانات الدخول غير صحيحة.");
      const sql = db();
      const [user] = await sql`SELECT * FROM "Users" WHERE "Email" = ${email} AND "ShopId" IS NULL AND "Active"`;
      // Always run a hash computation to avoid a trivial existence timing oracle.
      const valid = user ? verifyPassword(user.PasswordHash, password) : (hashPassword(password), false);
      if (!valid) throw new ApiFault(401, "بيانات الدخول غير صحيحة.");
      const session = newSession(user, input.deviceName);
      await insertSession(sql, session);
      signIn(ctx, session);
      return { userId: user.Id, shopId: user.ShopId, roles: [user.Role] };
    },
    { anonymous: true, limit: true },
  );

  r.get("/auth/me", (ctx) => {
    const a = ctx.actor;
    return { userId: a.userId, shopId: a.user!.ShopId, name: a.user!.Name, roles: [a.role], sessionId: a.session!.Id };
  });

  r.post("/auth/logout", async (ctx) => {
    if (ctx.actor.session) await db()`UPDATE "LoginSessions" SET "Active" = false WHERE "Id" = ${ctx.actor.session.Id}`;
    ctx.setCookies.push(clearCookie(SESSION_COOKIE));
    return noContent();
  });
}
