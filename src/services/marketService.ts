import type {
  Commodity,
  CommodityId,
  GameState,
  MarketEvent,
  MarketListing,
  Markets,
  Planet,
} from '../types/game'
import { COMMODITY_MAP, PLANET_MAP, cargoCapacityAtLevel, dailyUpkeep } from '../data/gameData'
import { settleContracts } from './contractService'
import { advanceMarketEvents, commodityEventScale } from './marketEventService'
import { hashString } from '../utils/hash'

/**
 * How far a market's daily re-pricing may sit either side of its structural
 * value.
 *
 * Centred on 1.0, so the expected price of any market is exactly its structural
 * price - which is what makes intel's forecast honest rather than optimistic.
 * At +/-4% this noise was smaller than the impact of any interesting order, so
 * the market barely moved and order size was the only force that mattered. The
 * drift is what makes a market a market: waiting, and arriving, now mean
 * something.
 */
export const DAILY_PRICE_DRIFT = 0.1

function randomFactor(planetId: string, commodityId: string, day: number): number {
  const h = hashString(`${planetId}:${commodityId}:${day}`)
  return (
    1 - DAILY_PRICE_DRIFT + ((h % 1000) / 1000) * DAILY_PRICE_DRIFT * 2
  )
}

const baseStockFor = (commodityId: CommodityId): number => {
  switch (commodityId) {
    case 'food': return 200
    case 'water': return 220
    case 'fuel': return 160
    case 'metals': return 140
    case 'electronics': return 110
    case 'medicine': return 100
    case 'luxury': return 70
    case 'crystals': return 45
  }
}

function stockFactor(stock: number, baseStock: number): number {
  const s = Math.max(0, stock)
  return 1 + ((baseStock - s) / baseStock) * 0.6
}

/**
 * Stock regeneration for one day: exponential pull back toward `baseStock`,
 * clamped to the market's ceiling. Shared by `advanceDay` and `projectStock`,
 * so a projected arrival can never drift from the stock the player lands on.
 */
function regenerateStock(stock: number, baseStock: number, stockMax: number): number {
  const regen = Math.max(0, stock + (baseStock - stock) * 0.2)
  return Math.max(0, Math.min(stockMax, Math.round(regen)))
}

/**
 * Memoised market prices. A price depends only on (planet, commodity, day,
 * stock, event scale), and the fill walks query long runs of adjacent stock
 * levels on every quote, so this turns a per-render O(quantity) walk into a
 * cache hit. The event scale is part of the key because it is a genuine input
 * to the price, not metadata - a cache hit across it would price a market mid
 * crop failure at its normal rate.
 */
const priceCache = new Map<string, number>()

/**
 * The price a market would fetch if it never drifted: its planet's appetite for
 * the goods, scaled by how scarce the stock is. The daily draw in `rawPrice`
 * is the only unknowable part, which is what intel is blind to.
 */
function structuralPrice(
  planet: Planet,
  commodity: Commodity,
  listing: MarketListing,
): number {
  const factor =
    planet.priceMods[commodity.id] * stockFactor(listing.stock, listing.baseStock)
  return commodity.basePrice * factor
}

/**
 * The full price: base × planet appetite × scarcity × the day's draw × any
 * active market event.
 *
 * The event multiplier is the last factor, which is what keeps it a modifier on
 * the existing calculation rather than a second pricing system: it rides every
 * fill, every quote and every forecast through the same one path.
 */
function rawPrice(
  planet: Planet,
  commodity: Commodity,
  listing: MarketListing,
  day: number,
  eventScale: number,
): number {
  return (
    structuralPrice(planet, commodity, listing) *
    randomFactor(planet.id, commodity.id, day) *
    eventScale
  )
}

function marketPrice(
  planet: Planet,
  commodity: Commodity,
  listing: MarketListing,
  day: number,
  eventScale: number,
): number {
  const key = `${planet.id}|${commodity.id}|${day}|${listing.stock}|${eventScale}`
  const hit = priceCache.get(key)
  if (hit !== undefined) return hit
  const price = Math.max(1, Math.round(rawPrice(planet, commodity, listing, day, eventScale)))
  // Bounded so a long session cannot grow this without limit. Prices are a pure
  // function of (planet, commodity, day, stock, event scale), so dropping
  // entries is always safe - it only costs recomputation.
  if (priceCache.size > 20000) priceCache.clear()
  priceCache.set(key, price)
  return price
}

function priceDelta(listing: MarketListing): number {
  return listing.price - listing.prevPrice
}

export function priceDirection(listing: MarketListing): 'up' | 'down' | 'flat' {
  const d = priceDelta(listing)
  if (d > 0) return 'up'
  if (d < 0) return 'down'
  return 'flat'
}

function createPlanetMarket(
  planet: Planet,
  day: number,
  events: readonly MarketEvent[],
): Record<CommodityId, MarketListing> {
  const result = {} as Record<CommodityId, MarketListing>
  for (const commodity of Object.values(COMMODITY_MAP)) {
    const mod = Math.max(0.4, planet.priceMods[commodity.id])
    const baseStock = Math.max(
      40,
      Math.round(baseStockFor(commodity.id) / mod),
    )
    const stockMax = Math.min(2000, Math.round(baseStock * 1.5))
    const stock = stockMax
    const listing: MarketListing = { price: 0, prevPrice: 0, stock, stockMax, baseStock }
    listing.price = marketPrice(
      planet,
      commodity,
      listing,
      day,
      commodityEventScale(events, planet.id, commodity.id, day),
    )
    listing.prevPrice = listing.price
    result[commodity.id] = listing
  }
  return result
}

export function createMarkets(
  planetIds: string[],
  day: number,
  events: readonly MarketEvent[] = [],
): Markets {
  const markets: Markets = {}
  for (const pid of planetIds) {
    const planet = PLANET_MAP[pid]
    if (!planet) continue
    markets[pid] = createPlanetMarket(planet, day, events)
  }
  return markets
}

function refreshPrice(
  market: Record<CommodityId, MarketListing>,
  planetId: string,
  commodityId: CommodityId,
  day: number,
  events: readonly MarketEvent[],
): void {
  const planet = PLANET_MAP[planetId]
  const listing = market[commodityId]
  if (!planet || !listing) return
  listing.price = marketPrice(
    planet,
    COMMODITY_MAP[commodityId],
    listing,
    day,
    commodityEventScale(events, planetId, commodityId, day),
  )
}

type Pricer = (level: MarketListing) => number

/**
 * Walks a buy through the book one unit at a time: each unit fills at the
 * price on the books *before* it is bought, and the market re-prices as the
 * stock drains.
 *
 * Averaging the pre- and post-trade price instead looks equivalent and is not.
 * Credits are whole numbers, so a total is rounded once - and rounding once per
 * chunk makes the result depend on how the player chopped the order up. On
 * cheap goods (water sits at 4-5 cr) a single 1 cr rounding step is a fifth of
 * the price, so any endpoint-based fill left chunking worth several percent
 * either way: ~13% cheaper before, and once the curve was made continuous,
 * ~6% cheaper the other way. Summing per-unit fills is neutral *by
 * construction* - a 100-unit order and a hundred 1-unit orders sum to exactly
 * the same credits - and it keeps whole-number credits, which is the whole
 * reason the naive version was attractive.
 *
 * The side effect is a good one: a 1-unit trade always fills at exactly the
 * price on screen.
 */
function buyFill(listing: MarketListing, qty: number, priceAt: Pricer): { cost: number; stock: number } {
  let stock = listing.stock
  let cost = 0
  // Clamped here as well as in the quoting functions, because this loop is what
  // makes a bad quantity dangerous: `k < Infinity` never fails, so a
  // non-finite count would spin forever and lock the tab rather than throw.
  const units = wholeUnits(qty)
  for (let k = 0; k < units; k++) {
    cost += priceAt({ ...listing, stock })
    stock = Math.max(0, stock - 1)
  }
  return { cost, stock }
}

/**
 * `quoteSell`'s counterpart: each unit fills at the price of the book *after*
 * it joins the stock.
 *
 * The asymmetry with `buyFill` is load-bearing. A buy charges the book before
 * each unit leaves ({S-q+1..S}); a sell charges the book after each unit
 * arrives ({S-q+1..S} again, from the depleted side). Charging the sell
 * *before* the addition instead shifts it to {S-q..S-1}, which no longer
 * retraces the buy: the round trip then nets P(S-q) - P(S) with stock fully
 * restored, which is free credits on repeat forever. Pairing them this way
 * makes buying and selling back the exact mirror of each other.
 *
 * It also means a 1-unit sale realises slightly *less* than the sticker, which
 * is the honest answer - you are moving the market you are quoting - while a
 * 1-unit purchase still fills at exactly it.
 */
function sellFill(listing: MarketListing, qty: number, priceAt: Pricer): { proceeds: number; stock: number } {
  let stock = listing.stock
  let proceeds = 0
  // Clamped for the same reason as in `buyFill`: an unbounded count would spin
  // here instead of failing.
  const units = wholeUnits(qty)
  for (let k = 0; k < units; k++) {
    stock = Math.min(listing.stockMax, stock + 1)
    proceeds += priceAt({ ...listing, stock })
  }
  return { proceeds, stock }
}

/** Prices a book level with the day's actual draw - what a trade really fills at. */
function livePricer(
  planet: Planet,
  commodity: Commodity,
  day: number,
  eventScale: number,
): Pricer {
  return (level) => marketPrice(planet, commodity, level, day, eventScale)
}

/**
 * Prices a book level without the day's draw, scaled by `driftScale`.
 *
 * The draw is a single multiplier applied to every fill in the trade, so
 * scaling the whole structural curve by it reproduces that day's proceeds
 * exactly. That is what makes the forecast band honest at the extremes rather
 * than a guess about how impact interacts with drift. An active event is scaled
 * in the same way, and for the same reason: it too is one multiplier on the
 * whole book.
 */
function forecastPricer(
  planet: Planet,
  commodity: Commodity,
  driftScale: number,
  eventScale: number,
): Pricer {
  return (level) =>
    Math.max(1, Math.round(structuralPrice(planet, commodity, level) * driftScale * eventScale))
}

/**
 * The unit price a buy of `qty` settles at, plus the stock and resting price it
 * leaves behind.
 *
 * The market panel, `buyCommodity`, and the intel panel all read the fill
 * price from here, so a quoted price can never disagree with the charge.
 *
 * `unitPrice` is the average the player pays per unit and is a fraction
 * (displayed rounded); `price` is the market's new resting price, which the
 * caller must persist. They are different values and conflating them is how a
 * listing ends up mispriced after a trade.
 */
/**
 * Trade quantities are whole units, or nothing.
 *
 * `Math.max(0, Math.floor(qty))` is the obvious one-liner and it is wrong twice
 * over. `Math.floor(NaN)` is `NaN` and `Math.max` propagates it, so `NaN` sailed
 * through as `NaN` units; and `Math.floor(Infinity)` is `Infinity`, which turns
 * a fill loop's `k < units` test into something that never terminates - a
 * browser-tab hang rather than an error.
 */
function wholeUnits(qty: number): number {
  return Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0
}

export function quoteBuy(
  planet: Planet,
  commodity: Commodity,
  listing: MarketListing,
  qty: number,
  day: number,
  eventScale: number,
): { unitPrice: number; cost: number; price: number; stock: number } {
  const units = wholeUnits(qty)
  const { cost, stock } = buyFill(listing, units, livePricer(planet, commodity, day, eventScale))
  return {
    unitPrice:
      units > 0 ? cost / units : marketPrice(planet, commodity, listing, day, eventScale),
    cost,
    price: marketPrice(planet, commodity, { ...listing, stock }, day, eventScale),
    stock,
  }
}

/**
 * What a sale of `qty` is worth in expectation, ignoring the day's draw.
 *
 * This is the honest ceiling on foresight: `randomFactor` is a pure function of
 * (planet, commodity, day), so the live quote knows the arrival price exactly.
 * Routing intel through here instead is what stops the Navigation Array from
 * being a solver - the player sees the trend, not the outcome. Pass a
 * `driftScale` of `1 -/+ DAILY_PRICE_DRIFT` for the band's edges.
 *
 * `eventScale` is deliberately not part of the uncertainty. A market event the
 * player can already see is known news, so it belongs in the forecast; the
 * drift is not observable until arrival, so it stays bracketed.
 */
export function quoteSellForecast(
  planet: Planet,
  commodity: Commodity,
  listing: MarketListing,
  qty: number,
  driftScale: number,
  eventScale: number,
): { unitPrice: number; proceeds: number } {
  const units = wholeUnits(qty)
  const { proceeds } = sellFill(
    listing,
    units,
    forecastPricer(planet, commodity, driftScale, eventScale),
  )
  return { unitPrice: units > 0 ? proceeds / units : 0, proceeds }
}

/**
 * The unit price a sale of `qty` settles at, plus the stock and resting price
 * it leaves behind. Symmetric with `quoteBuy`: restock one unit at a time and
 * take the going-down price, so the seller pays the same self-inflicted impact
 * the buyer does.
 */
export function quoteSell(
  planet: Planet,
  commodity: Commodity,
  listing: MarketListing,
  qty: number,
  day: number,
  eventScale: number,
): { unitPrice: number; proceeds: number; price: number; stock: number } {
  const units = wholeUnits(qty)
  const { proceeds, stock } = sellFill(listing, units, livePricer(planet, commodity, day, eventScale))
  return {
    unitPrice:
      units > 0 ? proceeds / units : marketPrice(planet, commodity, listing, day, eventScale),
    proceeds,
    price: marketPrice(planet, commodity, { ...listing, stock }, day, eventScale),
    stock,
  }
}

/**
 * The one number a sale of `qty` is worth: what `sellCommodity` will actually
 * credit, to the credit.
 *
 * Every surface that quotes a sale reads it from here - the Trade tab's sell
 * button, the Ship tab's hold valuation, the arrival report. That is
 * deliberate. The obvious shortcut is `qty * listing.price`, and it was what
 * this used to do: a resting price is the price of the *next* unit, so valuing
 * a load by it ignores the impact of the load itself and overstates the figure
 * by more than 10% on a full hold. A player told their cargo is worth 900 cr
 * and paid 786 has been lied to, and the Ship tab had no way to know it.
 *
 * It is the buy side's mirror image: `quoteBuy` is what the buy button charges,
 * and quoting a buy any other way is the same bug in the other direction.
 */
export function saleValue(
  state: GameState,
  commodityId: CommodityId,
  qty: number,
): number {
  const listing = state.markets[state.planetId]?.[commodityId]
  const planet = PLANET_MAP[state.planetId]
  if (!listing || !planet) return 0
  const units = wholeUnits(qty)
  if (units <= 0) return 0
  return quoteSell(
    planet,
    COMMODITY_MAP[commodityId],
    listing,
    units,
    state.day,
    commodityEventScale(state.activeEvents, state.planetId, commodityId, state.day),
  ).proceeds
}

/**
 * What the player paid per unit of a held commodity.
 *
 * `migrate` drops a cost-basis entry it cannot read, so this fallback is
 * reachable from a repaired save, and it used to differ per call site: net
 * worth used the commodity's base price while the hold view and the sale
 * itself used the local market price. The same missing datum therefore had two
 * answers, and net worth could disagree with the sale it was supposed to
 * measure. The local market price wins: it is what a sale would be measured
 * against, and it keeps the three read sites in agreement.
 */
export function cargoBasisAt(state: GameState, commodityId: CommodityId): number {
  const basis = state.costBasis[commodityId]
  if (basis !== undefined && Number.isFinite(basis)) return basis
  return (
    state.markets[state.planetId]?.[commodityId]?.price ??
    COMMODITY_MAP[commodityId].basePrice
  )
}

export function buyCommodity(
  state: GameState,
  commodityId: CommodityId,
  qty: number,
): { state: GameState; error?: string } {
  const listing = state.markets[state.planetId]?.[commodityId]
  const planet = PLANET_MAP[state.planetId]
  if (!planet || !listing) return { state, error: 'No market here.' }
  if (!Number.isInteger(qty) || qty <= 0) return { state, error: 'Enter a quantity first.' }

  const capacity = cargoCapacityAtLevel(state.ship.cargoLevel)
  const used = cargoUsed(state)
  const space = capacity - used
  if (qty > space) return { state, error: `Not enough cargo space (${space} free).` }
  if (listing.stock < qty) return { state, error: 'Not enough stock on this market.' }

  // Charge the settled price, not the sticker price: draining the stock is
  // what moves the price, and the buyer caused that move. `sellCommodity`
  // already worked this way, so this only removes the asymmetry.
  const commodity = COMMODITY_MAP[commodityId]
  const eventScale = commodityEventScale(state.activeEvents, state.planetId, commodityId, state.day)
  const { unitPrice, cost, price, stock } = quoteBuy(
    planet,
    commodity,
    listing,
    qty,
    state.day,
    eventScale,
  )
  if (cost > state.credits) return { state, error: `Not enough credits (need ${cost}).` }

  const ownedBefore = state.cargo[commodityId]
  const ownedAfter = ownedBefore + qty
  // A new position is based at what this trade actually paid per unit, which
  // is the averaged fill rather than the resting price the trade leaves behind.
  const basisBefore = state.costBasis[commodityId] ?? unitPrice
  const costBasisAfter = (basisBefore * ownedBefore + cost) / ownedAfter

  const nextCargo = { ...state.cargo, [commodityId]: ownedAfter }
  const nextCostBasis = { ...state.costBasis, [commodityId]: costBasisAfter }
  const nextMarkets = {
    ...state.markets,
    [state.planetId]: {
      ...state.markets[state.planetId],
      [commodityId]: { ...listing, stock, price },
    },
  }

  return {
    state: {
      ...state,
      credits: state.credits - cost,
      cargo: nextCargo,
      costBasis: nextCostBasis,
      markets: nextMarkets,
      stats: {
        ...state.stats,
        goodsBought: state.stats.goodsBought + qty,
      },
    },
  }
}

export function sellCommodity(
  state: GameState,
  commodityId: CommodityId,
  qty: number,
): { state: GameState; error?: string } {
  const listing = state.markets[state.planetId]?.[commodityId]
  const planet = PLANET_MAP[state.planetId]
  if (!planet || !listing) return { state, error: 'No market here.' }
  if (!Number.isInteger(qty) || qty <= 0) return { state, error: 'Enter a quantity first.' }

  const owned = state.cargo[commodityId]
  if (owned < qty) return { state, error: `You only have ${owned} ${COMMODITY_MAP[commodityId].name}.` }

  const { proceeds, price, stock } = quoteSell(
    planet,
    COMMODITY_MAP[commodityId],
    listing,
    qty,
    state.day,
    commodityEventScale(state.activeEvents, state.planetId, commodityId, state.day),
  )
  const basis = cargoBasisAt(state, commodityId)
  const profit = proceeds - basis * qty
  const nextMarkets = {
    ...state.markets,
    [state.planetId]: {
      ...state.markets[state.planetId],
      [commodityId]: { ...listing, stock, price },
    },
  }

  const remaining = owned - qty
  const nextCostBasis = { ...state.costBasis }
  if (remaining === 0) delete nextCostBasis[commodityId]

  return {
    state: {
      ...state,
      credits: state.credits + proceeds,
      cargo: { ...state.cargo, [commodityId]: remaining },
      costBasis: nextCostBasis,
      markets: nextMarkets,
      stats: {
        ...state.stats,
        tradingProfit: state.stats.tradingProfit + profit,
        goodsSold: state.stats.goodsSold + qty,
      },
    },
  }
}

export function advanceDay(state: GameState): GameState {
  const day = state.day + 1
  // Events turn over before prices are recomputed, so a market is priced
  // against the events running on the day the player is actually looking at:
  // something that expired yesterday is not in tomorrow's price, and something
  // that began today is.
  const events = advanceMarketEvents(state.activeEvents, day)
  const nextMarkets: Markets = {}
  for (const [planetId, record] of Object.entries(state.markets)) {
    const planet = PLANET_MAP[planetId]
    if (!planet) {
      nextMarkets[planetId] = record
      continue
    }
    const nextRecord = {} as Record<CommodityId, MarketListing>
    for (const commodityId of Object.keys(record) as CommodityId[]) {
      const listing = record[commodityId]
      const nextListing: MarketListing = {
        ...listing,
        stock: regenerateStock(listing.stock, listing.baseStock, listing.stockMax),
        prevPrice: listing.price,
      }
      nextRecord[commodityId] = nextListing
    }
    for (const commodityId of Object.keys(nextRecord) as CommodityId[]) {
      refreshPrice(nextRecord, planetId, commodityId, day, events)
    }
    nextMarkets[planetId] = nextRecord
  }
  return { ...state, day, markets: nextMarkets, activeEvents: events }
}

/**
 * A day the player waits at a planet: markets re-price and upkeep is charged.
 *
 * The clamp is the whole point. Refusing the wait when the player cannot pay
 * would brick anyone who has run out of credits *and* cargo - they cannot pay
 * upkeep, cannot sell anything, and cannot afford fuel, so there is no way
 * back. Charging a partial bill keeps waiting available and never takes credits
 * negative; the moment they sell, the full rate resumes.
 *
 * This lives here rather than inline in `GameContext` so the guarantee is
 * reachable by `verify-game.ts`. It was in the component, where no check could
 * reach it: deleting the `Math.min` left all 114 checks passing.
 *
 * Returns the amount actually charged so the log can say whether the bill was
 * paid in full or not at all.
 */
export function waitDay(state: GameState): { state: GameState; charged: number } {
  const charged = Math.min(dailyUpkeep(state.ship), state.credits)
  return {
    // A waited day is also the contract clock: deadlines are checked here rather
    // than in a component, so `settleContracts` is reachable by the verify
    // script. Waiting and jumping are the only two ways the day moves, so this
    // and `travel` are the only two places a deadline can pass.
    state: settleContracts({ ...advanceDay(state), credits: state.credits - charged }),
    charged,
  }
}

/**
 * The stock a market will hold after `days` of regeneration.
 *
 * Deliberately returns stock and not a `MarketListing`. Projecting the price
 * too would hand intel a price oracle - the arrival price is the structural
 * value times the day's drift, and the drift is the one thing the player is
 * meant not to know until they get there. Returning a listing invited exactly
 * that misuse, so the type no longer permits it. Stock is fully predictable:
 * it only ever moves toward the market's baseline.
 */
export function projectStock(listing: MarketListing, days: number): number {
  let stock = listing.stock
  for (let i = 0; i < days; i++) {
    stock = regenerateStock(stock, listing.baseStock, listing.stockMax)
  }
  return stock
}

export function cargoUsed(state: GameState): number {
  return Object.values(state.cargo).reduce((sum, qty) => sum + qty, 0)
}

export function cargoFree(state: GameState): number {
  return Math.max(0, cargoCapacityAtLevel(state.ship.cargoLevel) - cargoUsed(state))
}