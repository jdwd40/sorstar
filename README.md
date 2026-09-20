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
- Saves are versioned (currently v2, for price-history migration) and validated/migrated on load.
- Optional WebAudio sound effects (buy/sell/travel/upgrade/wins) with a header mute toggle.

## Tech & architecture

- Vite + React 18 + TypeScript + Tailwind CSS.
- **Persistence is isolated behind a service interface** (`GameStore` in `src/services/gameStore.ts`). The current implementation is `LocalStorageGameStore`; a future backend can slot in as a `microJBaseGameStore` without touching game logic or UI.
- Pure game logic lives in `src/services/*` (market, travel, player, game) and is side-effect free — `scripts/verify-game.ts` exercises the core loop headlessly (`npx tsx scripts/verify-game.ts`) for a full buy→jump→sell→upgrade sanity check.

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run lint` | ESLint |
| `npm run preview` | Preview the production build |
| `npx tsx scripts/verify-game.ts` | Run the headless game-logic sanity checks |