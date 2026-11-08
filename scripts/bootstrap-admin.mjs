// Creates the first platform administrator (and a default plan/settings row) once.
// Usage: BOOTSTRAP_EMAIL=... BOOTSTRAP_PHONE=059xxxxxxx BOOTSTRAP_PASSWORD=... npm run db:bootstrap-admin
// With --optional (used by the Vercel build) it never prompts: it skips when the variables are
// missing, and leaves an existing administrator alone.
// BOOTSTRAP_RESET=true (one deploy only) sets BOOTSTRAP_PASSWORD on the platform account with
// BOOTSTRAP_EMAIL, creating it if needed — a recovery path that needs only the Vercel dashboard.
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const optional = process.argv.includes("--optional");
if (optional && (!url || !process.env.BOOTSTRAP_EMAIL || !process.env.BOOTSTRAP_PASSWORD)) {
  const missing = ["BOOTSTRAP_EMAIL", "BOOTSTRAP_PASSWORD"].filter((n) => !process.env[n]);
  console.log(`[bootstrap-admin] skipping: not set: ${url ? missing.join(", ") : "DATABASE_URL"}`);
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
// The phone is optional for administrators (they sign in with email); a unique non-dialable
// placeholder keeps the Users.Phone unique index satisfied without blocking real shop numbers.
const phoneInput = (optional ? process.env.BOOTSTRAP_PHONE ?? "" : await ask("BOOTSTRAP_PHONE", "Admin phone (059/056…, optional): ")).trim();
const password = await ask("BOOTSTRAP_PASSWORD", "Admin password (12+ chars): ");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) throw new Error("Bootstrap email must be valid.");
if (password.length < 12) throw new Error("Password must be at least 12 characters.");
if (phoneInput && !/^0(59|56)\d{7}$/.test(phoneInput)) throw new Error("BOOTSTRAP_PHONE must start with 059 or 056 and have 10 digits (or be left empty).");
const phone = phoneInput || `admin:${email}`;
const reset = process.env.BOOTSTRAP_RESET === "true";
if (password !== password.trim())
  console.log("[bootstrap-admin] WARNING: BOOTSTRAP_PASSWORD starts or ends with a space; it is used exactly as stored.");
console.log(`[bootstrap-admin] email=${email} password length=${password.length} reset=${reset}`);

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
    const admins = await tx`SELECT "Email", "Active" FROM "Users" WHERE "ShopId" IS NULL ORDER BY "Email"`;
    console.log(`[bootstrap-admin] platform accounts: ${admins.map((a) => a.Email + (a.Active ? "" : " (inactive)")).join(", ") || "none"}`);
    if (reset) {
      const [user] = await tx`SELECT "Id" FROM "Users" WHERE "Email" = ${email} AND "ShopId" IS NULL`;
      if (user) {
        await tx`UPDATE "Users" SET "PasswordHash" = ${hash}, "Active" = true, "Role" = 'PlatformAdmin' WHERE "Id" = ${user.Id}`;
        await tx`UPDATE "LoginSessions" SET "Active" = false WHERE "UserId" = ${user.Id}`;
        return "reset";
      }
      const [phoneOwner] = phoneInput ? await tx`SELECT "Id", "ShopId" FROM "Users" WHERE "Phone" = ${phone}` : [];
      if (phoneOwner?.ShopId) throw new Error(`BOOTSTRAP_PHONE ${phone} belongs to a shop account; use a different phone.`);
      if (phoneOwner) {
        // Same admin phone, new email: update that platform account.
        await tx`UPDATE "Users" SET "Email" = ${email}, "PasswordHash" = ${hash}, "Active" = true, "Role" = 'PlatformAdmin' WHERE "Id" = ${phoneOwner.Id}`;
        await tx`UPDATE "LoginSessions" SET "Active" = false WHERE "UserId" = ${phoneOwner.Id}`;
        return "reset";
      }
    } else if (existing) {
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
  console.log(
    result === "exists"
      ? "[bootstrap-admin] An administrator already exists; nothing changed. To set a new password, add BOOTSTRAP_RESET=true for one deploy."
      : result === "reset"
        ? `[bootstrap-admin] Password reset for ${email}. Remove BOOTSTRAP_RESET and BOOTSTRAP_PASSWORD now.`
        : `[bootstrap-admin] Administrator ${email} created. Remove BOOTSTRAP_PASSWORD (and BOOTSTRAP_RESET) now.`,
  );
} finally {
  await sql.end();
}
