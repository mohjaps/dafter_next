// Applies db/schema.sql (idempotent; compatible with databases created by the earlier .NET backend).
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const optional = process.argv.includes("--optional");
if (!url) {
  if (optional) {
    console.log("[migrate] DATABASE_URL not set; skipping database migration.");
    process.exit(0);
  }
  console.error("Set DATABASE_URL (see .env.example).");
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error("[migrate] DATABASE_URL must start with postgres:// — use Prisma's *direct* connection string, not prisma+postgres://");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  await sql.unsafe(schema.replace(/^﻿/, ""));
  const rows = await sql`SELECT "MigrationId" FROM "__EFMigrationsHistory" ORDER BY 1`;
  console.log("Schema is up to date:", rows.map((r) => r.MigrationId).join(", "));
} finally {
  await sql.end();
}
