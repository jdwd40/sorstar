# Sorstar

A single-player space trading MVP. Buy low in one star system, jump your ship across the galaxy, sell high, and reinvest your credits in bigger holds, faster engines, and market intelligence — until your net worth reaches the goal.

## How to play

1. `npm install`
2. `npm run dev`
3. Open the local URL, click **New Game**, and start trading.

The loop: **Buy** a commodity at a planet where it's cheap → **Travel** to a planet where it's expensive → **Sell** for profit → repeat. Spend your earnings in the **Ship** tab on cargo capacity, engine efficiency, and a navigation array that unlocks trade-lead intel. A flight log in the **Log** tab records every move.

## Game model

- 8 commodities whose prices drift from base prices depending on planet price modifiers, local stock levels, and a deterministic per-planet/per-day random factor.
- Market prices react to you: buying drains stock and pushes the price up, selling restocks and pushes it down, and **you trade at the settled price, not the listed one**. A trade walks the book unit by unit, so every unit of a large order pays the going rate as your own order moves the market — a 1-unit buy fills at exactly the displayed price, and 100 units cost noticeably more per unit than one. Splitting an order into smaller ones buys you nothing: a 100-unit order and a hundred 1-unit orders cost identical credits. Price cells are colour-banded (cheap/fair/dear) with day-over-day ▲/▼ arrows.
- **Markets drift.** Each market also carries a daily swing of up to ±10% around its structural value, so waiting is a real option and no price is knowable for certain. This is what makes a jump a judgement rather than arithmetic: you can see what you will *pay* at the origin, but what you will *get* on arrival is a forecast.
- Each jump costs fuel (`distance in ly × credits/ly`) and advances the in-game calendar; markets are re-priced per day travelled. Travel is always confirmed first, with a warp animation and an arrival report pricing your hold at what it would actually fetch there.
- Waiting a day at a planet charges **daily upkeep** of `1 + cargo + engine + 2× nav` credits (capped at 13), so a bigger ship is more expensive to keep. Fuel already prices travel days, so jumps are never charged upkeep on top. If you can't cover the bill it is charged down to whatever credits you have left, so waiting can never strand you. The Ship tab shows the running rate.
- Upgrades are tiered and capped: Cargo Hold (up to 100 units), Warp Engine (fuel cost down to 1.5 cr/ly), Navigation Array (market intel). Intel ranks trade leads by **expected** profit and brackets each one with a forecast range for the arrival price plus an explicit worst case — it tells you where a market is trending, not where it will open. The forecast is honest rather than flattering: measured over hundreds of simulated runs it lands within a couple of percent of the quoted expectation, erring on the cautious side.
- Win condition: reach **100,000 cr** net worth — cash + the **cost** of your cargo + value invested in upgrades — *and* have sold goods at a realised profit. Cargo is valued at what you paid, not at local market prices, so net worth reflects money actually made rather than riding the market's day-to-day swings. Once won, you keep playing in a legend-hero game.
- **Every figure the UI quotes comes from the same helper the transaction uses.** The Trade tab's sell button, the Ship tab's hold table and the arrival report all read one `saleValue`, so the number on screen is the number credited. Valuing a load by the *listed* price (`qty × price`) looks equivalent and overstates a full hold by double digits, because the listed price is the price of the next unit and ignores the impact of the load itself.
- Stats name what they measure. **Trading profit** is what sales paid out less what the goods cost — it is not "total profit": fuel, upkeep and upgrades are running costs of the business, not the result of trading it, and they show up in net worth instead. A loss is recorded as a negative, not clamped away. The win screen reports **peak** net worth (the figure you actually won on), and "units traded" counts a unit each time it crosses a market.
- Upgrades report the new total *and* what it changed: buying the 12 → 20 hold tier says `Cargo Hold Lv1 — 20 units (+8)`, not `(+20 units)`.
- Saves are versioned (currently v3, for the price-history and `tradingProfit` migrations) and validated/migrated on load. The localStorage key stays at `sorstar.save.v2` on purpose: it names the save, not the schema, so a version bump never strands a browser's progress. Persistence goes through a `GameStore` interface: **PocketBase** when `VITE_PB_URL` is set, `LocalStorageGameStore` when it is not. There is deliberately no default, so an unconfigured production build saves to localStorage rather than pointing every player's browser at their own machine.

## PocketBase persistence

Saves are stored permanently on a PocketBase server instead of the browser's localStorage, so they survive cache clears and can live on a shared/hosted instance. Each browser gets its own anonymous PocketBase account on first use, so every device keeps its own save. The pilot's generated credentials are kept in localStorage (never a real account password) so an expired session resumes the same pilot — and its save — instead of silently starting over. Use **Log in / Sign up** in the header (also available while playing) to bind that save to an email — a new account adopts the browser's current game, and signing in on another device pulls up your account's save.

Saves are also repaired on load. Cargo counts and cost-basis entries that are missing or non-finite are dropped, and the rest of the save is kept — a bad entry for one commodity costs you that commodity, not the game. A cost basis that went missing falls back to the local market price everywhere it is read (net worth, the hold table and the sale itself), so the three can never disagree about the same missing number, and a listing missing its previous price is repaired to "unchanged" rather than rendering `NaN%` beside a live price. Cumulative stats that are absent default to zero. Damage that cannot be repaired by a sane fallback (an unknown planet, a missing ship, a non-numeric cumulative total) is reported as a load error instead of being guessed at, because silently defaulting your credits to zero would destroy a run with no explanation. Credits and day always take this stricter path. Trade quantities are validated the same way: only whole positive units are accepted.

A registered account is **never** resumed from the stored pilot credentials. Those credentials belong to a different, older identity whose save record outlives registration, so authenticating with them would quietly load a stale game while reporting success. If an account's session cannot be restored, a temporary pilot is used and a banner prompts you to sign in again — your account's save is untouched and comes back on the next sign-in.

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

`.env.development` already sets `VITE_PB_URL=http://127.0.0.1:8090`, which switches the app to the PocketBase store. Copy `.env.example` for the server admin credentials (`PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD`) and bind address (`PB_HTTP`). `npm run pb:serve` applies the superuser and migrations on the way up, so setup is a server-side step — `npm run build` is a pure frontend build and does not need the PocketBase binary, which keeps a fresh clone and any static-hosting CI working.

**`.env.production` sets no `VITE_PB_URL` at all.** It is comments only. This is deliberate:

- `vite build` inlines the value into the bundle, so any default becomes the permanent production value for every player.
- `127.0.0.1` resolves in the *player's* browser, not on your server. A localhost default would send every player's save requests to their own machine, where there is nothing listening — the game would look configured and silently store saves locally instead.
- Failing closed to localStorage is honest. A save server that is not there is better than one that cannot be reached.

To use PocketBase in production, supply the URL at build time:

```sh
VITE_PB_URL=https://pb.example.com npm run build
```

or put it in an untracked `.env.production.local`, which Vite merges over `.env.production` (and `.gitignore` already covers). With `VITE_PB_URL` unset the app uses `LocalStorageGameStore`: saves live in that one browser and clearing site data loses them.

Schema changes are committed as JS migrations in `pb/pb_migrations` and are applied automatically on `serve`. The admin dashboard lives at `http://127.0.0.1:8090/_/`.

## Tech & architecture

- Vite + React 18 + TypeScript + Tailwind CSS.
- **Persistence is isolated behind a service interface** (`GameStore` in `src/services/gameStore.ts`). Two implementations exist: `PocketBaseGameStore` when `VITE_PB_URL` is set at build time, and `LocalStorageGameStore` otherwise. Nothing defaults to either, so a production build without configuration stores saves locally.
- Optional WebAudio sound effects (buy/sell/travel/upgrade/wins) with a header mute toggle.

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check + production build (frontend only, no PocketBase binary needed) |
| `npm run lint` | ESLint |
| `npm run preview` | Preview the production build |
| `npm run pb:install` | Download the PocketBase server binary |
| `npm run pb:setup` | Create superuser + apply migrations |
| `npm run pb:serve` | Run the PocketBase server |
| `npm run typecheck` | TypeScript across app, build config, and the verification script |
| `npm run verify` | Run the headless game-logic sanity checks (`scripts/verify-game.ts`) |
