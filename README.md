# دفتر — Daftar

Grocery-shop management (POS, purchases, stock, customer/supplier debts, cashbox, expenses, returns, reports) plus a platform admin for shops, plans and subscriptions. Arabic, right-to-left.

This is the full-stack **Next.js 16 + TypeScript** version of Daftar. It replaces the previous Vite frontend (`dafter_frontend`) and ASP.NET Core backend (`dafter_backend`) with one app you can deploy to Vercel.

- **UI**: Next.js App Router (`src/app`), with the screens ported from the Vite app (`src/client`).
- **API**: Next.js route handlers at `/api/v1/*` (`src/server`). They keep the same contract as the .NET API: endpoints, JSON shapes, error messages, roles, CSRF, idempotency keys and money/stock rules.
- **Database**: PostgreSQL, with the **same schema as the .NET backend** (`db/schema.sql`). You can point this app at the existing `daftar_db`. Existing data and admin passwords keep working, because the ASP.NET Identity V3 hash format is supported.

## Run locally

Requirements: Node 22+ and PostgreSQL 14+.

```bash
cp .env.example .env.local      # then edit DATABASE_URL
npm install
npm run db:migrate              # idempotent; safe on an existing .NET-created database
npm run db:bootstrap-admin      # prompts for admin email, phone, password (once)
npm run dev
```

- Shop / staff login: http://localhost:3000/login. The login code is shown on screen when `OTP_EXPOSE_DEVELOPMENT_CODE=true`.
- Platform admin: http://localhost:3000/admin/login
- Health: `/health` and `/health/ready` (checks the database and migrations)

## Deploy to Vercel

1. Import this GitHub repo in the Vercel dashboard. The framework is detected as Next.js, and no build settings are needed.
2. Add a Postgres database: **Storage → Neon** in Vercel, or any hosted Postgres. Vercel's integration sets `DATABASE_URL`/`POSTGRES_URL`. Prefer the *pooled* connection string.
3. Set the environment variables (Project → Settings → Environment Variables):
   - `SESSION_SECRET`: 32+ random characters (`openssl rand -hex 32`). **Required.**
   - `OTP_PROVIDER_URL` and `OTP_PROVIDER_TOKEN`: your SMS gateway (HTTPS). The API POSTs `{"phone","code"}` with a Bearer token.
4. To create the first admin, also add `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PHONE` and `BOOTSTRAP_PASSWORD` (12+ characters).
   Vercel runs `vercel-build`, which **applies the database schema and creates that admin automatically** before building.
   Both steps are idempotent: later deploys skip the admin because one already exists. You can then delete `BOOTSTRAP_PASSWORD`.
   (You can also run `npm run db:migrate` / `npm run db:bootstrap-admin` yourself with `DATABASE_URL` set.)
5. Deploy. Every push to `main` redeploys automatically.

> **No SMS provider yet?** Shop logins need an OTP. For a short demo only, you can set `OTP_EXPOSE_DEVELOPMENT_CODE=true` **and** `OTP_ALLOW_INSECURE_DEMO_CODE=true`. The code is then returned to the browser, so **anyone who knows a shop phone number can log in**. Remove both before real use.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run type-check` / `lint` | TypeScript and ESLint |
| `npm test` | Unit tests (money rounding, return amounts) |
| `npm run db:migrate` | Applies `db/schema.sql` (idempotent; also runs automatically on Vercel builds) |
| `npm run db:bootstrap-admin` | Creates the first platform admin, default plan and settings |
| `python tests/integration/smoke.py --base-url http://localhost:3000` | Full API integration suite (needs a disposable DB, `OTP_EXPOSE_DEVELOPMENT_CODE=true`, `DAFTAR_TEST_ADMIN_EMAIL/PASSWORD`) |
| `python tests/integration/returns.py --base-url …` | Sales/purchase returns integration suite |

CI (`.github/workflows/ci.yml`) runs type-check, lint, unit tests and the build. It also runs both integration suites against a PostgreSQL service.

## Layout

```
src/app/                 Next.js routes: (shop)/…, admin/(panel)/…, login, admin/login, api/v1/[...path], health
src/client/              UI: screens (live/), API client, router shim, shell/nav
src/server/              API: router + auth/CSRF (http.ts), actor/sessions, idempotent commands,
                         finance (sales/purchases/ledgers), returns, routes/{auth,merchant,admin}.ts
src/styles/              CSS (unchanged from the Vite app)
db/schema.sql            Schema (identical to the .NET EF Core migrations)
scripts/                 migrate + bootstrap-admin
tests/                   unit (node:test) and integration (Python, stdlib only)
```

## Notes

- Money is stored as integer cents. Quantities and average costs use exact decimals (`decimal.js`, stored as `numeric`). Rounding is half away from zero, the same as the .NET version.
- Every state-changing shop command locks the shop row and requires an `Idempotency-Key`. A replay returns the stored response.
- The login rate limit (10 per minute per IP) is kept in memory for each server instance. On Vercel that is per function instance, which is best-effort. Add Vercel WAF rate limiting if you need a hard global limit.
