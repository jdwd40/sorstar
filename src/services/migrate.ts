import type { CommodityId, GameState, MarketEvent, MarketListing, Stats } from '../types/game'
import {
  COMMODITY_MAP,
  GAME_VERSION,
  MARKET_EVENT_MAP,
  PLANETS,
  PLANET_MAP,
} from '../data/gameData'
import { marketEventId } from './marketEventService'

function assertNumber(v: unknown, label: string): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Corrupt save: ${label} must be a number`)
}

/**
 * A non-negative whole number, or `undefined` for anything else. Used for
 * per-unit records (cargo counts, cost basis) where a missing or malformed
 * entry can be dropped without losing the rest of the save, rather than
 * thrown over the way a top-level field is.
 */
function wholeOrUndef(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined
  return Math.floor(v)
}

/**
 * A complete cargo record: sanitised, with every commodity zero-filled.
 *
 * An absent count means "none of that aboard", so zero is the truthful repair.
 * Filling from the commodity list also drops stray keys a hand-edited save may
 * have picked up.
 */
function cleanCargo(record: unknown): GameState['cargo'] {
  const cleaned = cleanUnits(record)
  const cargo = {} as GameState['cargo']
  for (const id of Object.keys(COMMODITY_MAP) as CommodityId[]) {
    cargo[id] = cleaned[id] ?? 0
  }
  return cargo
}

/** Strip non-finite entries from a per-unit record, keeping the rest. */
function cleanUnits(record: unknown): Partial<Record<string, number>> {
  const out: Record<string, number> = {}
  if (record === null || typeof record !== 'object') return out
  for (const [cid, v] of Object.entries(record)) {
    const n = wholeOrUndef(v)
    if (n !== undefined) out[cid] = n
  }
  return out
}

/**
 * Coerce a stat to a finite number, falling back to `fallback` only when the
 * field is genuinely absent.
 *
 * Stats are cumulative counters that the trade and upgrade services
 * increment, so a `NaN` here does not just look wrong in the log panel: it
 * poisons every later total *and* defeats the victory gate, because
 * `NaN > 0` is false. A `NaN` is unrecoverable and gets reported; a missing
 * field can only predate the stat and is safely zeroed.
 */
function statOr(raw: number, fallback: number, label: string): number {
  if (raw === undefined || raw === null) return fallback
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new Error(`Corrupt save: stats.${label} must be a number`)
  }
  return raw
}

/**
 * Structural validation that runs before any migration so a versioned-but-
 * malformed save surfaces as a load error instead of passing and crashing the
 * first time the player waits/travels (advanceDay indexes every market,
 * buy/sell index costBasis, etc.). 404 still means "no save"; a malformed save
 * must not look like "no save".
 */
function assertModel(raw: GameState): void {
  if (!raw || typeof raw !== 'object' || raw.version == null) {
    throw new Error('Corrupt save: missing version')
  }
  if (typeof raw.planetId !== 'string' || !PLANET_MAP[raw.planetId]) {
    throw new Error(`Corrupt save: unknown planet "${String(raw.planetId)}"`)
  }
  assertNumber(raw.credits, 'credits')
  assertNumber(raw.day, 'day')

  const commodityIds = Object.keys(COMMODITY_MAP) as CommodityId[]
  if (!raw.markets || typeof raw.markets !== 'object') {
    throw new Error('Corrupt save: markets missing')
  }
  for (const planet of PLANETS) {
    const record = raw.markets[planet.id]
    if (!record || typeof record !== 'object') {
      throw new Error(`Corrupt save: market for ${planet.id} missing`)
    }
    for (const cid of commodityIds) {
      const listing = record[cid]
      if (!listing || typeof listing !== 'object') {
        throw new Error(`Corrupt save: listing for ${planet.id}/${cid} missing`)
      }
      assertNumber(listing.price, `price ${planet.id}/${cid}`)
      assertNumber(listing.stock, `stock ${planet.id}/${cid}`)
      assertNumber(listing.stockMax, `stockMax ${planet.id}/${cid}`)
      assertNumber(listing.baseStock, `baseStock ${planet.id}/${cid}`)
    }
  }

  // Individual cargo counts are deliberately not asserted: they are repaired
  // by the sanitising pass below, because a damaged count for one commodity
  // should not cost the player the rest of their game.

  if (!raw.stats || typeof raw.stats !== 'object') {
    throw new Error('Corrupt save: stats missing')
  }

  if (!raw.ship || typeof raw.ship !== 'object') {
    throw new Error('Corrupt save: ship missing')
  }
  // Only the *shape* is enforced here. Values are repaired by the sanitising
  // pass in `migrate`, since a damaged cargo count or cost basis entry is
  // recoverable and should not cost the player the rest of their game.
  if (raw.cargo !== undefined && (raw.cargo === null || typeof raw.cargo !== 'object')) {
    throw new Error('Corrupt save: cargo must be an object')
  }
  if (raw.costBasis !== undefined && (raw.costBasis === null || typeof raw.costBasis !== 'object')) {
    throw new Error('Corrupt save: costBasis must be an object')
  }
  if (raw.activeEvents !== undefined && !Array.isArray(raw.activeEvents)) {
    throw new Error('Corrupt save: activeEvents must be an array')
  }
  assertNumber(raw.ship.cargoLevel, 'ship.cargoLevel')
  assertNumber(raw.ship.engineLevel, 'ship.engineLevel')
  assertNumber(raw.ship.navLevel, 'ship.navLevel')
}

export function migrate(raw: GameState): GameState {
  assertModel(raw)
  let state = { ...raw }

  if (state.version < 2) {
    const markets: GameState['markets'] = {}
    for (const [pid, record] of Object.entries(state.markets)) {
      const next: Record<string, MarketListing> = {}
      for (const [cid, listing] of Object.entries(record)) {
        next[cid] = { ...listing, prevPrice: listing.price }
      }
      markets[pid] = next as GameState['markets'][string]
    }
    state = {
      ...state,
      version: 2,
      markets,
      log: Array.isArray(state.log) ? state.log : [],
      stats: {
        ...state.stats,
        maxNetWorth: state.stats.maxNetWorth ?? 0,
        victory: state.stats.victory ?? false,
        victorySeen: state.stats.victorySeen ?? false,
        victoryDay: state.stats.victoryDay ?? null,
      },
    }
  }

  if (state.version < 3) {
    // v3: `totalProfit` was renamed `tradingProfit`. The number did not change
    // - it has always been realised trading profit only - but the old name
    // invited it to be read as money made, so it is carried forward under a
    // name that says what it is. A value that cannot be read is still reported
    // rather than zeroed, on the same grounds as the self-healing pass below.
    const legacy = state.stats as unknown as Record<string, unknown>
    if ('totalProfit' in legacy) {
      const { totalProfit: legacyProfit, ...kept } = legacy
      state = {
        ...state,
        stats: {
          ...(kept as unknown as Stats),
          tradingProfit: statOr(legacyProfit as number, 0, 'totalProfit (legacy tradingProfit)'),
        },
      }
    } else if (!('tradingProfit' in legacy)) {
      state = { ...state, stats: { ...state.stats, tradingProfit: 0 } }
    }
    state = { ...state, version: 3 }
  }

  if (state.version < GAME_VERSION) {
    // v4: market events. Older saves have none, which is a truthful reading of
    // the sector rather than lost progress: events are drawn as days advance,
    // so the next day fills this back in on its own.
    state = { ...state, activeEvents: [], version: GAME_VERSION }
  }

  // Self-healing pass. Runs on every load, not just version upgrades, because
  // the realistic way to reach one of these is a save edited by hand or
  // written by a future bug, not an old build.
  const stats = state.stats
  state = {
    ...state,
    // Credits and day are deliberately absent: `assertModel` rejects a
    // non-finite value for both before this point. Defaulting them would be
    // worse than the error it replaces - a player handed 0 credits has lost
    // their game with no way to tell why.
    //
    // Cargo and cost basis are per-unit records, so a bad entry is dropped and
    // the commodity reverts to the same fallback every read site already
    // handles: the local market price, which is what a sale is measured
    // against.
    cargo: cleanCargo(state.cargo),
    costBasis: cleanUnits(state.costBasis),
    // The market panel draws its day-over-day arrow from `prevPrice`. A
    // listing missing it (or holding a non-number) renders "NaN%" next to a
    // price, so fall back to treating the price as unchanged.
    markets: repairPrevPrices(state.markets),
    activeEvents: cleanEvents(state.activeEvents, state.day),
    stats: {
      ...stats,
      tradingProfit: statOr(stats.tradingProfit, 0, 'tradingProfit'),
      goodsBought: statOr(stats.goodsBought, 0, 'goodsBought'),
      goodsSold: statOr(stats.goodsSold, 0, 'goodsSold'),
      tripsMade: statOr(stats.tripsMade, 0, 'tripsMade'),
      upgradesInvested: statOr(stats.upgradesInvested, 0, 'upgradesInvested'),
      maxNetWorth: statOr(stats.maxNetWorth, 0, 'maxNetWorth'),
    },
  }
  return state
}

/** Fills in a missing or non-numeric `prevPrice` from the listing's price. */
function repairPrevPrices(markets: GameState['markets']): GameState['markets'] {
  const out: GameState['markets'] = {}
  for (const [planetId, record] of Object.entries(markets)) {
    const fixed: Record<string, MarketListing> = {}
    for (const [commodityId, listing] of Object.entries(record)) {
      fixed[commodityId] = {
        ...listing,
        prevPrice:
          typeof listing.prevPrice === 'number' && Number.isFinite(listing.prevPrice)
            ? listing.prevPrice
            : listing.price,
      }
    }
    out[planetId] = fixed as GameState['markets'][string]
  }
  return out
}

/**
 * Market events that can still be acted on.
 *
 * An event is only load-bearing if it names a real planet and a real event
 * type over a usable span; anything else would either move no price or move it
 * forever. Each entry is independent, so one damaged event costs that event and
 * nothing else. Events that had already expired by the save's day are dropped
 * too - they are gone from the markets either way, and keeping them would grow
 * the save every load.
 */
function cleanEvents(events: unknown, day: number): MarketEvent[] {
  if (!Array.isArray(events)) return []
  const out: MarketEvent[] = []
  const seen = new Set<string>()
  for (const raw of events) {
    if (!raw || typeof raw !== 'object') continue
    const event = raw as Partial<MarketEvent>
    if (typeof event.eventType !== 'string' || !MARKET_EVENT_MAP[event.eventType]) continue
    if (typeof event.planetId !== 'string' || !PLANET_MAP[event.planetId]) continue
    const startDay = wholeOrUndef(event.startDay)
    const endDay = wholeOrUndef(event.endDay)
    if (startDay === undefined || endDay === undefined || endDay <= startDay) continue
    if (endDay <= day) continue
    // Ids are derived, so a missing or duplicated one is rebuilt rather than
    // trusted: a doubled id would make a single event look like it both began
    // and ended, and log both.
    const id = marketEventId(event.eventType, event.planetId, startDay)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      eventType: event.eventType,
      planetId: event.planetId,
      startDay,
      endDay,
    })
  }
  return out
}