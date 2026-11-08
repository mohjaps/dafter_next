import { db } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LATEST = "20261022102347_InvoiceReturns";

export async function GET() {
  try {
    const [row] = await db()`SELECT 1 AS ok FROM "__EFMigrationsHistory" WHERE "MigrationId" = ${LATEST}`;
    return row ? Response.json({ status: "ready" }) : Response.json({ status: "migrations pending" }, { status: 503 });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
