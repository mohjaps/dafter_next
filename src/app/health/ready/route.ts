import { db } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LATEST = "20261022102347_InvoiceReturns";

export async function GET() {
  try {
    const [row] = await db()`SELECT 1 AS ok FROM "__EFMigrationsHistory" WHERE "MigrationId" = ${LATEST}`;
    const sessionSecret = (process.env.SESSION_SECRET ?? "").length >= 32 ? "ok" : "missing or too short";
    return row && sessionSecret === "ok" ? Response.json({ status: "ready", sessionSecret }) : Response.json({ status: row ? "not ready" : "migrations pending", sessionSecret }, { status: 503 });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown";
    return Response.json({ status: "unavailable", reason, sessionSecret: (process.env.SESSION_SECRET ?? "").length >= 32 ? "ok" : "missing or too short" }, { status: 503 });
  }
}
