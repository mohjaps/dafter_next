// Creates the first platform administrator (and a default plan/settings row) once.
// Usage: BOOTSTRAP_EMAIL=... BOOTSTRAP_PHONE=059xxxxxxx BOOTSTRAP_PASSWORD=... npm run db:bootstrap-admin
// With --optional (used by the Vercel build) it never prompts and never fails the build:
// it skips when the variables are missing or an administrator already exists.
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const optional = process.argv.includes("--optional");
if (optional && (!url || !process.env.BOOTSTRAP_EMAIL || !process.env.BOOTSTRAP_PHONE || !process.env.BOOTSTRAP_PASSWORD)) {
  console.log("[bootstrap-admin] BOOTSTRAP_EMAIL/PHONE/PASSWORD not all set; skipping.");
  process.exit(0);
}
if (!url) throw new Error("Set DATABASE_URL.");
async function ask(name, question) {
  if (process.env[name]) return process.env[name];
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}
const email = (await ask("BOOTSTRAP_EMAIL", "Admin email: ")).trim().toLowerCase();
const phone = (await ask("BOOTSTRAP_PHONE", "Admin phone (059/056…): ")).trim();
const password = await ask("BOOTSTRAP_PASSWORD", "Admin password (12+ chars): ");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) throw new Error("Bootstrap email must be valid.");
if (password.length < 12) throw new Error("Password must be at least 12 characters.");
if (!/^0(59|56)\d{7}$/.test(phone)) throw new Error("Phone must start with 059 or 056 and have 10 digits.");

// ASP.NET Identity V3 hash (PBKDF2-HMAC-SHA512, 100k iterations) — same format the API verifies.
const salt = randomBytes(16);
const header = Buffer.alloc(13);
header[0] = 1;
header.writeUInt32BE(2, 1);
header.writeUInt32BE(100_000, 5);
header.writeUInt32BE(16, 9);
const hash = Buffer.concat([header, salt, pbkdf2Sync(password, salt, 100_000, 32, "sha512")]).toString("base64");

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const result = await sql.begin(async (tx) => {
    const [existing] = await tx`SELECT 1 FROM "Users" WHERE "Role" = 'PlatformAdmin' LIMIT 1`;
    if (existing) {
      if (optional) return "exists";
      throw new Error("An administrator already exists. Bootstrap does not overwrite accounts.");
    }
    await tx`INSERT INTO "Users" ("Id", "ShopId", "Name", "Phone", "Email", "PasswordHash", "Role", "Active")
      VALUES (${randomUUID()}, NULL, 'مدير النظام', ${phone}, ${email}, ${hash}, 'PlatformAdmin', true)`;
    const [plan] = await tx`SELECT 1 FROM "Plans" LIMIT 1`;
    if (!plan) await tx`INSERT INTO "Plans" ("Id", "Name", "PriceCents", "Months", "Devices", "Active") VALUES (${randomUUID()}, 'الأساسية', 5000, 1, 2, true)`;
    const [settings] = await tx`SELECT 1 FROM "PlatformSettings" LIMIT 1`;
    if (!settings) await tx`INSERT INTO "PlatformSettings" ("Id", "Name", "Phone", "Email", "GraceDays") VALUES (${randomUUID()}, 'دفتر', '', '', 3)`;
  });
  console.log(result === "exists"
    ? "[bootstrap-admin] An administrator already exists; nothing changed. You can delete BOOTSTRAP_PASSWORD now."
    : "Administrator created. Remove BOOTSTRAP_PASSWORD from your environment.");
} finally {
  await sql.end();
}
