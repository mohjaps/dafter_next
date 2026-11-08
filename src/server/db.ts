import "server-only";
import postgres from "postgres";
import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Postgres client. Reuses one pool per server instance (and across hot reloads in dev). */
function create() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("Set DATABASE_URL (see .env.example).");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idle_timeout: 20,
    connect_timeout: 15,
    // Transaction poolers (Neon/Supabase "pooled" URLs) cannot hold prepared statements.
    prepare: process.env.DATABASE_PREPARE === "true",
    onnotice: () => {},
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      numeric: { to: 1700, from: [1700], serialize: (x: Decimal | string | number) => String(x), parse: (x: string) => new Decimal(x) },
      // Raw text so decimals inside invoice lines keep full precision (parsed with lines.ts).
      jsonb: { to: 3802, from: [3802], serialize: (x: string) => x, parse: (x: string) => x },
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });
}

export type Sql = ReturnType<typeof create>;
// Transaction-scoped and pool-scoped clients share the tagged-template interface we use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;

const g = globalThis as unknown as { __daftarSql?: Sql };
export function db(): Sql {
  g.__daftarSql ??= create();
  return g.__daftarSql;
}
export { Decimal };
