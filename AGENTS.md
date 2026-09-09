# AGENTS.md — VEDD AI Trading Vault

Guide for any AI coding agent (Codex, Claude Code, etc.) working in this repo.
Read this before making changes. This is a **live, real-money trading app** — the
safety rules are not optional.

---

## What this is
- **Stack:** Node/Express + TypeScript backend, React (Vite + wouter + @tanstack/react-query + Tailwind) frontend, Drizzle ORM over Render Postgres.
- **Product:** AI trading engines (FX/forex, options, futures, crypto, prediction markets) + a self-learning "brain", prop-firm tooling, copy-trade, ambassador program.
- **Repo:** `Goddren/VEDDSSFULL`. **Prod:** https://veddbuild.com (Render). **Deploy branch:** `main`.

---

## ⚠️ Safety rules (this app trades real money)
1. **Never place, enable, or modify live trades without explicit human approval.** Auto-trade flags (e.g. `dxtrade_connections.auto_trade_enabled`, engine `is_active`) gate real orders on funded prop accounts and a real crypto hot wallet.
2. **Never touch, print, upload, or commit secrets.** `.env` holds `DATABASE_URL`, broker API keys, wallet private keys, encryption keys. It is gitignored — keep it that way.
3. **Work on a branch, not `main`.** Open a PR for human review. Do not auto-merge trading-logic changes.
4. **Do not run destructive DB writes** (UPDATE/DELETE) or prod migrations without approval.
5. **Never move/bridge crypto funds or handle wallet private keys** — that stays with the human.
6. When in doubt on anything that reaches a broker, exchange, or the DB — **ask first.**

---

## 🚀 Build & deploy pipeline (follow EXACTLY)
Production serves the **committed `dist/`** — Render's build does **not** reliably regenerate it (OOM history). So you MUST rebuild and commit `dist/` to ship anything.

For every change:
1. **Typecheck:** `npx tsc --noEmit`
   - Vite/esbuild do **NOT** typecheck — a scope/reference/type bug compiles fine but crashes at runtime into the "Something went wrong" error boundary.
   - Only **NEW** errors matter. Baseline noise exists (e.g. `server/routes.ts`, `server/openai.ts`, `server/services/live-trading-engine.ts` have pre-existing errors). Compare against baseline; don't try to fix unrelated pre-existing errors.
2. **Bump the service-worker cache version** IF you changed any client code: edit `client/public/sw.js` → `CACHE_VERSION = 'vedd-vNNN'` (increment). Without this, already-open mobile/PWA tabs never force-reload and users get stale JS (silent blank/broken UI, no error). Skip this for server-only changes.
3. **Build:** `npm run build` (runs `vite build` + esbuild bundling `server/index.ts` and `server/crypto-cron.ts` → `dist/`).
4. **Commit source + `dist/`** together. End commit messages with the project's Co-Authored-By trailer if your tooling uses one.
5. **Push to `main`** (or open a PR).
6. **The human redeploys on Render** (or it auto-deploys, depending on config) — a code change is NOT live until redeployed.
7. **Verify live:** React pages render from the JS bundle, so `curl` of a route won't show new copy. Verify by loading the page in a browser, or `curl` the live `index-*.js` bundle and grep for the new string.

Commands:
```bash
npx tsc --noEmit          # typecheck (new errors only)
npm run build             # build client + server into dist/
npm run dev               # local dev (node --env-file=.env --import tsx/esm server/index.ts)
npm run crypto-cron       # run one crypto scan cycle and exit (Render Cron Job entry)
```

---

## Database access (for scripts / diagnostics)
- Connect with `pg` Pool reading `DATABASE_URL` from `.env`, `ssl: { rejectUnauthorized: false }`.
- Use **`.cjs`** files (the package is ESM, so plain `node script.js` needs `.cjs` for CommonJS `require`).
- Prefer read-only queries. Any UPDATE/DELETE needs human approval.
- Encrypted columns (broker passwords, wallet keys) use AES-256-CBC via `encryptApiSecret`/`decryptApiSecret` in `server/cryptocom.ts`, keyed by `CRYPTOCOM_ENCRYPTION_KEY` (must match across web service + cron or decryption fails).

---

## Key gotchas (learned the hard way)
- **react-query queryKey:** the default queryFn fetches `queryKey[0]` **verbatim** as the URL. Put ALL query params IN `queryKey[0]` (e.g. `` [`/api/crypto/prices?symbols=${x}`] ``), never as a second array element `['/api/x', param]` — a second element is silently dropped unless the query supplies its own `queryFn`.
- **Config PATCH allow-lists:** some config routes (e.g. `PATCH /api/cryptocom-engine/config`) only persist fields in an explicit `allowed` array — new fields silently don't save unless added there. (Note: `storage.updateUser` has NO allow-list, so user-column settings persist fine.)
- **Crypto engine memory:** runs as a standalone **cron** (`server/crypto-cron.ts`, `npm run crypto-cron`) — one scan then exit — because the always-on scanner leaked memory and OOM'd the whole instance. Keep `ENABLE_CRYPTO_ENGINE` **unset/false** on the web service so only the cron runs it (two copies = OOM).
- **Broker execution is async & unreliable:** never record a trade as filled/closed without confirming the broker actually did it (phantom-fill / phantom-close bugs recur). Gate DB writes on the broker/exchange success flag.
- **Column shapes vary:** `dxtrade_connections` has no `updated_at`; `ai_trade_results` stores both open (PENDING) and closed rows.

---

## Architecture pointers
- **FX SS-AI path:** `server/routes.ts` `POST /api/mt5/chart-data` (MT5 EA / TradeLocker post candles) → dual-agent consensus + `getAiVisionConfirmation` in `server/openai.ts` → executes via TradeLocker (`server/tradelocker.ts`) and DXtrade (`server/dxtrade.ts`).
- **Autonomous engine:** `server/services/live-trading-engine.ts` (the DXtrade fan-out lives here ~5060).
- **Crypto engine:** `server/services/cryptocom-scanner.ts` (+ `defi-executor.ts`/`defi-swap.ts` for DeFi, `cefi-executor.ts` for exchanges).
- **Tiers/pricing (marketing, 3 files — keep in sync):** `client/src/pages/pricing.tsx`, `client/src/pages/subscription.tsx`, `server/seed.ts`. Engine access is currently auth-only (`ProtectedRoute`), not tier-enforced server-side.
- **Active client tree is `client/src/`.** `client-only/` is a stale, unrouted duplicate — do not edit it.

---

## Definition of done
tsc shows no new errors → SW bumped (if client changed) → `npm run build` succeeded → source + `dist/` committed → pushed → human notified to redeploy → change verified live in the browser. Trading-execution and secrets stay under human control throughout.
