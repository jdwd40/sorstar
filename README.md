# Sorstar

A single-player space trading MVP. Buy low in one star system, jump your ship across the galaxy, sell high, and reinvest your credits in bigger holds, faster engines, and market intelligence — until your net worth reaches the goal.

## How to play

1. `npm install`
2. `npm run dev`
3. Open the local URL, click **New Game**, and start trading.

The loop: **Buy** a commodity at a planet where it's cheap → **Travel** to a planet where it's expensive → **Sell** for profit → repeat. Spend your earnings in the **Ship** tab on cargo capacity, engine efficiency, and a navigation array that unlocks trade-lead intel. A flight log in the **Log** tab records every move.

## Game model

- 8 commodities whose prices drift from base prices depending on planet price modifiers, local stock levels, and a deterministic per-planet/per-day random factor.
- Market prices react to you: buying drains stock and pushes the price up; selling restocks and pushes it down. Price cells are colour-banded (cheap/fair/dear) with day-over-day ▲/▼ arrows.
- Each jump costs fuel (`distance in ly × credits/ly`) and advances the in-game calendar; markets are re-priced per day travelled. Travel is always confirmed first, with a warp animation and an arrival report of your hold at local prices.
- Upgrades are tiered and capped: Cargo Hold (up to 100 units), Warp Engine (fuel cost down to 1.5 cr/ly), Navigation Array (market intel).
- Win condition: reach **100,000 cr** net worth (cash + cargo value at local prices + value invested in upgrades) — then keep exploring in a legend-hero game.
- Saves are versioned (currently v2, for price-history migration) and validated/migrated on load. Persistence goes through a `GameStore` interface. The default backend is **PocketBase** (see below), with a `LocalStorageGameStore` fallback when `VITE_PB_URL` is not set.

## PocketBase persistence

Saves are stored permanently on a PocketBase server instead of the browser's localStorage, so they survive cache clears and can live on a shared/hosted instance. Each browser gets its own anonymous PocketBase account on first use, so every device keeps its own save. The pilot's generated credentials are kept in localStorage (never a real account password) so an expired session resumes the same pilot — and its save — instead of silently starting over. Use **Log in / Sign up** in the header (also available while playing) to bind that save to an email — a new account adopts the browser's current game, and signing in on another device pulls up your account's save.

Setup:

```sh
npm run pb:install   # download the PocketBase binary (into pb/)
npm run pb:setup     # create the superuser + apply pb/pb_migrations
npm run pb:serve     # start the server on http://127.0.0.1:8090
```

Then in another terminal:

```sh
npm run dev
```

`.env.development` already sets `VITE_PB_URL=http://127.0.0.1:8090`, which switches the app to the PocketBase store. `.env.production` does the same for production builds, and `npm run build` runs the PocketBase setup (superuser + migrations) automatically before type-checking. Copy `.env.example` for the server admin credentials (`PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD`) and bind address (`PB_HTTP`). Override `VITE_PB_URL` per deployment — e.g. point it at a hosted PocketBase (`https://pb.example.com`); leaving it unset falls back to localStorage.

Schema changes are committed as JS migrations in `pb/pb_migrations` and are applied automatically on `serve`. The admin dashboard lives at `http://127.0.0.1:8090/_/`.
- Optional WebAudio sound effects (buy/sell/travel/upgrade/wins) with a header mute toggle.

## Tech & architecture

- Vite + React 18 + TypeScript + Tailwind CSS.
- **Persistence is isolated behind a service interface** (`GameStore` in `src/services/gameStore.ts`). Two implementations exist: `PocketBaseGameStore` (default, when `VITE_PB_URL` is set) and `LocalStorageGameStore` (fallback). Game rules in `src/services/*` are pure and side-effect free — `scripts/verify-game.ts` exercises the core loop headlessly (`npx tsx scripts/verify-game.ts`).
- Pure game logic lives in `src/services/*` (market, travel, player, game) and is side-effect free — `scripts/verify-game.ts` exercises the core loop headlessly (`npx tsx scripts/verify-game.ts`) for a full buy→jump→sell→upgrade sanity check.

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Run PocketBase setup, type-check + production build |
| `npm run lint` | ESLint |
| `npm run preview` | Preview the production build |
| `npm run pb:install` | Download the PocketBase server binary |
| `npm run pb:setup` | Create superuser + apply migrations |
| `npm run pb:serve` | Run the PocketBase server |
| `npm run verify` | Run the headless game-logic sanity checks |
