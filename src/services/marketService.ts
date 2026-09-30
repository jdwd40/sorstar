import type {
  Commodity,
  CommodityId,
  GameState,
  MarketListing,
  Markets,
  Planet,
} from '../types/game'
import { COMMODITY_MAP, PLANET_MAP, cargoCapacityAtLevel } from '../data/gameData'

function hashString(str: string): number {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

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
 * The continuous price curve, in whole-credit fractions.
 *
 * `marketPrice` rounds this to an integer, which is right for anything the
 * player *reads* but wrong for anything the player *pays*: rounding turns the
 * curve into a staircase, and on cheap goods a single 1 cr step is a fifth of
 * the price. Trade fills are priced off this instead, so impact is a smooth
 * quantity rather than a quantised one.
 */
/**
 * Memoised market prices. A price depends only on (planet, commodity, day,
 * stock), and the fill walks query long runs of adjacent stock levels on every
 * quote, so this turns a per-render O(quantity) walk into a cache hit.
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

function rawPrice(
  planet: Planet,
  commodity: Commodity,
  listing: MarketListing,
  day: number,
): number {
  return (
    structuralPrice(planet, commodity, listing) * randomFactor(planet.id, commodity.id, day)
  )
}

function marketPrice(
  planet: Planet,
  commodity: Commodity,
  listing: MarketListing,
  day: number,
): number {
  const key = `${planet.id}|${commodity.id}|${day}|${listing.stock}`
  const hit = priceCache.get(key)
  if (hit !== undefined) return hit
  const price = Math.max(1, Math.round(rawPrice(planet, commodity, listing, day)))
  // Bounded so a long session cannot grow this without limit. Prices are a pure
  // function of (planet, commodity, day, stock), so dropping entries is always
  // safe - it only costs recomputation.
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

function createPlanetMarket(planet: Planet, day: number): Record<CommodityId, MarketListing> {
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
    listing.price = marketPrice(planet, commodity, listing, day)
    listing.prevPrice = listing.price
    result[commodity.id] = listing
  }
  return result
}

export function createMarkets(planetIds: string[], day: number): Markets {
  const markets: Markets = {}
  for (const pid of planetIds) {
    const planet = PLANET_MAP[pid]
    if (!planet) continue
    markets[pid] = createPlanetMarket(planet, day)
  }
  return markets
}

function refreshPrice(
  market: Record<CommodityId, MarketListing>,
  planetId: string,
  commodityId: CommodityId,
  day: number,
): void {
  const planet = PLANET_MAP[planetId]
  const listing = market[commodityId]
  if (!planet || !listing) return
  listing.price = marketPrice(planet, COMMODITY_MAP[commodityId], listing, day)
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
function livePricer(planet: Planet, commodity: Commodity, day: number): Pricer {
  return (level) => marketPrice(planet, commodity, level, day)
}

/**
 * Prices a book level without the day's draw, scaled by `driftScale`.
 *
 * The draw is a single multiplier applied to every fill in the trade, so
 * scaling the whole structural curve by it reproduces that day's proceeds
 * exactly. That is what makes the forecast band honest at the extremes rather
 * than a guess about how impact interacts with drift.
 */
function forecastPricer(planet: Planet, commodity: Commodity, driftScale: number): Pricer {
  return (level) => Math.max(1, Math.round(structuralPrice(planet, commodity, level) * driftScale))
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
): { unitPrice: number; cost: number; price: number; stock: number } {
  const units = wholeUnits(qty)
  const { cost, stock } = buyFill(listing, units, livePricer(planet, commodity, day))
  return {
    unitPrice: units > 0 ? cost / units : marketPrice(planet, commodity, listing, day),
    cost,
    price: marketPrice(planet, commodity, { ...listing, stock }, day),
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
 */
export function quoteSellForecast(
  planet: Planet,
  commodity: Commodity,
  listing: MarketListing,
  qty: number,
  driftScale = 1,
): { unitPrice: number; proceeds: number } {
  const units = wholeUnits(qty)
  const { proceeds } = sellFill(listing, units, forecastPricer(planet, commodity, driftScale))
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
): { unitPrice: number; proceeds: number; price: number; stock: number } {
  const units = wholeUnits(qty)
  const { proceeds, stock } = sellFill(listing, units, livePricer(planet, commodity, day))
  return {
    unitPrice: units > 0 ? proceeds / units : marketPrice(planet, commodity, listing, day),
    proceeds,
    price: marketPrice(planet, commodity, { ...listing, stock }, day),
    stock,
  }
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
  const { unitPrice, cost, price, stock } = quoteBuy(planet, commodity, listing, qty, state.day)
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
  )
  const basis = state.costBasis[commodityId] ?? listing.price
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
        totalProfit: state.stats.totalProfit + profit,
        goodsSold: state.stats.goodsSold + qty,
      },
    },
  }
}

export function advanceDay(state: GameState): GameState {
  const day = state.day + 1
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
      refreshPrice(nextRecord, planetId, commodityId, day)
    }
    nextMarkets[planetId] = nextRecord
  }
  return { ...state, day, markets: nextMarkets }
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