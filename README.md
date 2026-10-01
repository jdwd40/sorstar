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
- **News moves prices.** Ten temporary market events — crop failures and bumper harvests, water shortages, fuel crises, mining strikes and mineral discoveries, tech expos, medical emergencies, luxury festivals, crystal discoveries — bend one commodity at one planet by 25–45% for 3–8 days. Events arrive deterministically (25% chance a day, never more than 3 at once in the sector, never two touching the same commodity on the same planet), are listed while you're standing on the affected planet, show as a ⚠ on every destination that is currently running one, and are written to the log as they start and end. They are a *multiplier on the same pricing path* every trade already uses, not a second economy: quotes, the stock drain on a big order, drift and impact pricing all keep working unchanged, so an event can't be dodged by splitting an order. Intel prices an event it can already see — and only if it will still be running when you arrive — so a shortage at the far end moves the forecast rather than surprising you, while one that runs out in transit is ignored. Nothing is scheduled ahead: only events currently running are stored, and they are derived from the day they started, so the same save rolled forward twice reaches the same market.
- Each jump costs fuel (`distance in ly × credits/ly`) and advances the in-game calendar; markets are re-priced per day travelled. Travel is always confirmed first, with a warp animation and an arrival report pricing your hold at what it would actually fetch there.
- **Travel encounters.** Roughly one jump in four runs into something — a distress call, a drifting cargo pod, a raider's demand, engine trouble, a debris field, a merchant convoy, a navigation anomaly, a customs patrol, a science probe, a fuel cache. One encounter per journey at most, rolled when the ship leaves, and every roll is a pure function of that flight (origin, destination, day, trips made), so a save reloaded mid-jump resumes the same encounter with the same options and the same outcome; there is no reroll button and no `Math.random`. The chance is 20% plus 2% per day in transit, capped at 30%, so a long haul is slightly more likely to be interesting than a hop next door. An interrupted jump is the same jump with a checkpoint in it: fuel is charged and the trip is counted at departure, the days already flown are advanced, and the ship waits **mid-jump** in a modal that cannot be dismissed, because the ship is between planets and every other action is refused until it lands. Answering applies the outcome and flies the rest of the flight, so the arrival report is the ordinary one, with a line saying what happened in transit.
- **An encounter is a choice with a cost you can see.** At least two choices are always offered and at least one is always open: a payment you cannot afford is refused and its button says so, and a hold with no room cannot be filled. Quoted payments are exact and identical on a reloaded save; uncertain ones (a shake-down, a repair bill) are described as a gamble, and any loss is drawn within what you actually hold, so a raider can never leave you in the red. **A delay costs a real day**, charged through the ordinary clock, so markets re-price, market events age and a contract deadline can be missed because of something that happened in transit. Salvaged cargo enters the hold at a **cost basis of 0** — it was found, not bought — blended into any basis already held, so net worth does not jump because the player picked something up; a convoy pallet is bought at a 60–80% discount to the market being left and is booked at the price paid. No encounter creates a market event, restocks a market or books trading profit: it touches credits, the hold and the calendar, and nothing else.
- Waiting a day at a planet charges **daily upkeep** of `1 + cargo + engine + 2× nav` credits (capped at 13), so a bigger ship is more expensive to keep. Fuel already prices travel days, so jumps are never charged upkeep on top. If you can't cover the bill it is charged down to whatever credits you have left, so waiting can never strand you. The Ship tab shows the running rate.
- Upgrades are tiered and capped: Cargo Hold (up to 100 units), Warp Engine (fuel cost down to 1.5 cr/ly), Navigation Array (market intel). Intel ranks trade leads by **expected** profit and brackets each one with a forecast range for the arrival price plus an explicit worst case — it tells you where a market is trending, not where it will open. The forecast is honest rather than flattering: measured over hundreds of simulated runs it lands within a couple of percent of the quoted expectation, erring on the cautious side.
- Win condition: reach **100,000 cr** net worth — cash + the **cost** of your cargo + value invested in upgrades — *and* have sold goods at a realised profit. Cargo is valued at what you paid, not at local market prices, so net worth reflects money actually made rather than riding the market's day-to-day swings. Once won, you keep playing in a legend-hero game.
- **Every figure the UI quotes comes from the same helper the transaction uses.** The Trade tab's sell button, the Ship tab's hold table and the arrival report all read one `saleValue`, so the number on screen is the number credited. Valuing a load by the *listed* price (`qty × price`) looks equivalent and overstates a full hold by double digits, because the listed price is the price of the next unit and ignores the impact of the load itself.
- **Delivery contracts.** A second, small economy on top of the market: the board offers up to 3 jobs at your current planet, and you can carry up to 2 at once. Each contract is a promise to carry `N` of a commodity to another planet by a fixed deadline, for a fixed fee. Accepting a contract moves nothing — no cargo, no credits, no market stock. You still buy the load yourself at the origin market (like any other trade). You fly it there, and you hand it over explicitly at the destination — arriving does not complete anything. The reward is set at the moment the offer is generated, covers the estimated goods plus fuel and a deterministic 20–40% premium, and is never re-priced if the market moves. Contracts that miss their deadline fail (cargo and credits remain yours; only the fee is lost), and are logged and dropped. Completed contracts add to `contractsCompleted` and `contractRevenue`; failed add to `contractsFailed`. Contract revenue is tracked separately from trading profit because the goods were still bought and sold in the sense of fulfilling an order — the fee is not a trading margin. The board refills only when offers are taken, when they expire, or when you move to a different planet; it never regenerates on render.
- Stats name what they measure. **Trading profit** is what sales paid out less what the goods cost — it is not "total profit": fuel, upkeep and upgrades are running costs of the business, not the result of trading it, and they show up in net worth instead. A loss is recorded as a negative, not clamped away. The win screen reports **peak** net worth (the figure you actually won on), and "units traded" counts a unit each time it crosses a market.
- Upgrades report the new total *and* what it changed: buying the 12 → 20 hold tier says `Cargo Hold Lv1 — 20 units (+8)`, not `(+20 units)`.
- Saves are versioned (currently v6, adding `pendingEncounter` on top of the v5 contracts, contract stats, `tradingProfit` and `activeEvents` migrations) and validated/migrated on load. The localStorage key stays at `sorstar.save.v2` on purpose: it names the save, not the schema, so a version bump never strands a browser's progress. Persistence goes through a `GameStore` interface: **PocketBase** when `VITE_PB_URL` is set, `LocalStorageGameStore` when it is not. There is deliberately no default, so an unconfigured production build saves to localStorage rather than pointing every player's browser at their own machine.

## PocketBase persistence

Production uses browser-local saves by default: progress stays in that browser and clearing site data loses it. PocketBase is an optional, separately configured service. When enabled, saves are stored on that server instead of the browser's localStorage. Each browser gets its own anonymous PocketBase account on first use, so every device keeps its own save. The pilot's generated credentials are kept in localStorage (never a real account password) so an expired session resumes the same pilot — and its save — instead of silently starting over. Use **Log in / Sign up** in the header (also available while playing) to bind that save to an email — a new account adopts the browser's current game, and signing in on another device pulls up your account's save.

A save in flight is part of the save: a jump interrupted by an encounter carries its type, the two planets, the days, and the fuel already spent, and nothing else — no strings, no functions. A v5 save loads docked at its planet rather than mid-jump, a save naming an encounter this build no longer has lands the ship instead of stranding it, and a flight whose dates could not have happened (more days flown than the flight is long, a departure in the future) is dropped.

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
- **Persistence is isolated behind a service interface** (`GameStore` in `src/services/gameStore.ts`). Two implementations exist: `PocketBaseGameStore` when `VITE_PB_URL` is set at build time, and `LocalStorageGameStore` otherwise. No PocketBase URL is assumed, so a production build without configuration stores saves locally.
- Optional WebAudio sound effects (buy/sell/travel/upgrade/wins) with a header mute toggle.

## Deployment

Production URL: https://jdwd40.com/sorstar. GitHub is the source of truth. Pushes to `main` run `.github/workflows/deploy.yml`: Node 22, `npm ci`, lint, typecheck, game verification, deployment/service-worker/live-verifier safety tests, `npm run build`, and `npm run verify:build`, then automatic restricted rsync deployment. Manual `workflow_dispatch` runs deploy only from `main`. Runs share one concurrency group and do not cancel a deployment in progress.

The controller has configured encrypted secrets `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` (pinned `[jdwd40.com]:4020` host keys) and variables `DEPLOY_HOST=jdwd40.com`, `DEPLOY_PORT=4020`, `DEPLOY_USER=jd`. The dedicated key is forced to `restrict,command="/usr/bin/rrsync -wo /var/www/jdwd40.com/html/sorstar"`. Its remote `/` is exactly `/var/www/jdwd40.com/html/sorstar`; the destination cannot be configured. The verified first backup is **outside the web root**, at `/home/jd/deployment-backups/sorstar/before-cicd-20261001T140952Z.tar.gz` on `app-vps`. No Nginx, backend, or database changes are needed.

CI captures portfolio, coins, study, and dc titles/checksums before rsync, then compares them afterward. It also compares the deployed entrypoint and every build file by SHA-256, checks both `/sorstar` and `/sorstar/`, and checks direct refresh of `/sorstar/game` (including its trailing-slash form). A missing asset served as status-200 fallback HTML fails verification. The old `/sorstar/sw.js` is replaced by a retirement worker: it unregisters only that exact scope, refreshes only Sorstar windows, and deletes only caches whose nonempty contents are entirely same-origin `/sorstar/` URLs. Mixed/empty caches and browser saves remain intact.

Troubleshoot with `gh run list --repo jdwd40/sorstar --workflow deploy.yml`, then `gh run view RUN_ID --repo jdwd40/sorstar --log-failed`. Check exact variables, nonempty secrets, pinned host keys, and public SSH reachability on port 4020. A verification failure after rsync does not roll back files automatically; inspect the failed URL or neighbour checksum before retrying. Delayed rsync updates reduce partial-file exposure but do not make the whole directory switch atomic.

For an emergency/manual deployment, trigger the same checks and secret-backed deployment from `main`:

```sh
gh workflow run deploy.yml --ref main --repo jdwd40/sorstar
```

To retry the failed jobs of an existing run:

```sh
gh run rerun RUN_ID --failed --repo jdwd40/sorstar
```

The deployment private key exists only in the encrypted GitHub secret; it cannot be retrieved from GitHub. A low-level deployment from a reviewed checkout, after the same checks and build, requires a **separately approved dedicated restricted identity** and controller-provided pinned hosts file (both nonempty regular files, mode 600). **Never substitute an ordinary shell identity**: the script's fixed remote `/` is safe only with the Sorstar-only forced rrsync root.

```sh
DEPLOY_HOST=jdwd40.com DEPLOY_PORT=4020 DEPLOY_USER=jd \
  DEPLOY_IDENTITY_FILE=/absolute/path/to/sorstar-restricted-identity \
  DEPLOY_KNOWN_HOSTS_FILE=/absolute/path/to/pinned-known-hosts \
  node scripts/deploy-sorstar.mjs dist
```

For a low-level manual run, first capture neighbours with `node scripts/verify-live.mjs snapshot node_modules/.tmp/sorstar-neighbours.json` and afterward run `node scripts/verify-live.mjs verify node_modules/.tmp/sorstar-neighbours.json`. The project scratch directory `node_modules/.tmp` is created by the prerequisite typecheck/build. Production builds leave `VITE_PB_URL` unset and retain localStorage persistence; optional PocketBase setup is separate and must not repurpose existing services.

The page title is preserved as `Sorstar - Space Trading Command Center`, matching the existing homepage CI assertion. This keeps that check compatible without changing the unrelated homepage repository.

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
| `npm run test:deploy` | Check deployment guards, scoped service-worker retirement, and live verification with mocks |
| `npm run verify:build` | Validate nonempty build files and `/sorstar/` asset paths |
