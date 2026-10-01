import type {
  CommodityId,
  Contract,
  GameState,
  MarketEvent,
  MarketListing,
  PendingEncounter,
  Stats,
} from '../types/game'
import {
  COMMODITY_MAP,
  MARKET_EVENT_MAP,
  MAX_ACTIVE_CONTRACTS,
  MAX_AVAILABLE_CONTRACTS,
  PLANETS,
  PLANET_MAP,
  TRAVEL_ENCOUNTER_MAP,
} from '../data/gameData'
import { marketEventId } from './marketEventService'
import { contractId } from './contractService'
import { encounterId } from './encounterService'

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
  if (raw.contracts !== undefined && !Array.isArray(raw.contracts)) {
    throw new Error('Corrupt save: contracts must be an array')
  }
  if (
    raw.pendingEncounter !== undefined &&
    raw.pendingEncounter !== null &&
    (typeof raw.pendingEncounter !== 'object' || Array.isArray(raw.pendingEncounter))
  ) {
    throw new Error('Corrupt save: pendingEncounter must be an object or null')
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

  if (state.version < 4) {
    // v4: market events. Older saves have none, which is a truthful reading of
    // the sector rather than lost progress: events are drawn as days advance,
    // so the next day fills this back in on its own.
    state = { ...state, activeEvents: [], version: 4 }
  }

  if (state.version < 5) {
    // v5: delivery contracts. Older saves have none, and nothing was lost: a
    // contract is a job on offer, so a player who never saw one missed no
    // progress. The board refills on the next day.
    state = { ...state, contracts: [], version: 5 }
  }

  if (state.version < 6) {
    // v6: travel encounters. Older saves have none, and nothing was lost: a save
    // written before encounters existed was never interrupted, so there is no
    // journey left hanging to resume. The next jump draws one if the roll says so.
    state = { ...state, pendingEncounter: null, version: 6 }
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
    contracts: cleanContracts(state.contracts),
    pendingEncounter: cleanPendingEncounter(state.pendingEncounter, statOr(stats.tripsMade, 0, 'tripsMade')),
    stats: {
      ...stats,
      tradingProfit: statOr(stats.tradingProfit, 0, 'tradingProfit'),
      goodsBought: statOr(stats.goodsBought, 0, 'goodsBought'),
      goodsSold: statOr(stats.goodsSold, 0, 'goodsSold'),
      tripsMade: statOr(stats.tripsMade, 0, 'tripsMade'),
      upgradesInvested: statOr(stats.upgradesInvested, 0, 'upgradesInvested'),
      maxNetWorth: statOr(stats.maxNetWorth, 0, 'maxNetWorth'),
      contractRevenue: statOr(stats.contractRevenue, 0, 'contractRevenue'),
      contractsCompleted: statOr(stats.contractsCompleted, 0, 'contractsCompleted'),
      contractsFailed: statOr(stats.contractsFailed, 0, 'contractsFailed'),
    },
  }
  return state
}

/**
 * A non-negative *whole* number, or `undefined` for anything else.
 *
 * Stricter than `wholeOrUndef`, which floors - correct for a cargo count that
 * can only ever hold units, but wrong for a contract: a load of 2.5 is not a
 * load of 2, and quietly shrinking a promise the client signed is worse than
 * dropping the damaged entry and letting the board redraw it.
 */
function exactWholeOrUndef(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return undefined
  return v
}

/**
 * Contracts that can still be acted on.
 *
 * A contract is only load-bearing if every field the client and the game read
 * off it is usable: a real commodity, a load of it, two real and *different*
 * planets, a deadline after the day it was offered, a positive fee, and a
 * status that is still live. A resolved contract - one already delivered, or
 * one that failed - is dropped rather than kept, because a save cannot tell a
 * completed contract from a pending one that happens to be missing a field, and
 * paying out on the wrong guess would be worse than dropping the job.
 *
 * Each entry is independent, so one damaged contract costs that contract and
 * nothing else. Ids are derived, so a missing or duplicated one is rebuilt the
 * same way `cleanEvents` rebuilds its own.
 */
function cleanContracts(contracts: unknown): Contract[] {
  if (!Array.isArray(contracts)) return []
  const out: Contract[] = []
  const seen = new Set<string>()
  for (const raw of contracts) {
    if (!raw || typeof raw !== 'object') continue
    const contract = raw as Partial<Contract>
    if (typeof contract.commodityId !== 'string' || !COMMODITY_MAP[contract.commodityId]) continue
    if (typeof contract.originPlanetId !== 'string' || !PLANET_MAP[contract.originPlanetId]) continue
    if (
      typeof contract.destinationPlanetId !== 'string' ||
      !PLANET_MAP[contract.destinationPlanetId] ||
      contract.destinationPlanetId === contract.originPlanetId
    ) {
      continue
    }
    const quantity = exactWholeOrUndef(contract.quantity)
    if (quantity === undefined || quantity < 1) continue
    const offeredDay = exactWholeOrUndef(contract.offeredDay)
    const deadlineDay = exactWholeOrUndef(contract.deadlineDay)
    if (offeredDay === undefined || deadlineDay === undefined) continue
    if (deadlineDay <= offeredDay) continue
    if (typeof contract.reward !== 'number' || !Number.isFinite(contract.reward) || contract.reward < 1) continue
    // Anything not still live - including a status from a build that kept
    // resolved contracts around - resolves to a contract nobody is owed.
    if (contract.status !== 'available' && contract.status !== 'accepted') continue

    const fields = {
      commodityId: contract.commodityId,
      quantity,
      originPlanetId: contract.originPlanetId,
      destinationPlanetId: contract.destinationPlanetId,
      offeredDay,
      deadlineDay,
      reward: Math.round(contract.reward),
      status: contract.status,
    }
    // A duplicate id is a damaged record, not a second contract: re-deriving the
    // id would resurrect the copy as a fresh offer. Only an id that is missing
    // or unusable is rebuilt, into a slot nothing else is using.
    const storedId = contract.id
    if (typeof storedId === 'string' && storedId.length > 0) {
      if (seen.has(storedId)) continue
      seen.add(storedId)
      out.push({ ...fields, id: storedId })
    } else {
      const id = contractId(
        offeredDay,
        contract.originPlanetId,
        firstFreeSlot(seen, offeredDay, contract.originPlanetId),
      )
      seen.add(id)
      out.push({ ...fields, id })
    }
  }
  return boundContracts(out)
}

/** The lowest board slot not already spoken for, so a rebuilt id cannot collide. */
function firstFreeSlot(seen: Set<string>, offeredDay: number, originPlanetId: string): number {
  for (let slot = 0; slot < MAX_ACTIVE_CONTRACTS + MAX_AVAILABLE_CONTRACTS; slot++) {
    if (!seen.has(contractId(offeredDay, originPlanetId, slot))) return slot
  }
  return MAX_ACTIVE_CONTRACTS + MAX_AVAILABLE_CONTRACTS
}

/**
 * At most one hold's worth of work survives a load.
 *
 * The board and the hold are both bounded by the game, so an unbounded list can
 * only come from a hand-edited save - and it would be carried by every load and
 * every save forever. Accepted contracts are kept ahead of offers because they
 * are obligations the player is already flying, and both are kept in the order
 * they arrived, which is the order they were read in.
 */
function boundContracts(contracts: Contract[]): Contract[] {
  const accepted = contracts.filter((c) => c.status === 'accepted').slice(0, MAX_ACTIVE_CONTRACTS)
  const available = contracts.filter((c) => c.status === 'available').slice(0, MAX_AVAILABLE_CONTRACTS)
  return [...accepted, ...available]
}

/**
 * A pending encounter that can still be resolved, or null.
 *
 * The record is only worth keeping if it can be played out: a real encounter
 * type this build still has, two real and different planets, a departure day, a
 * trigger day inside the flight, a flight of at least one day, and a fuel bill
 * that is a real number. Everything the player reads or pays is derived from
 * the type and the id, so those are all it takes.
 *
 * A damaged record is dropped rather than repaired. The alternative - guessing
 * a missing flight and landing the player at a destination the record does not
 * name - would move a ship and spend days on the strength of a corrupt field,
 * which is far worse than voiding an encounter and letting the player fly the
 * journey again from where they left. `planetId` is still the origin in a valid
 * record, so dropping it leaves a save that is coherent and flyable.
 *
 * A stored id is kept when it is usable, and rebuilt from the flight's own
 * inputs when it is missing or empty, so a save hand-edited into having no id
 * still describes the same encounter. `tripsMade` is the save's count *after*
 * the interrupted trip was booked, so the seed index is one back.
 */
function cleanPendingEncounter(raw: unknown, tripsMade: number): PendingEncounter | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const pending = raw as Partial<PendingEncounter>

  if (typeof pending.type !== 'string' || !TRAVEL_ENCOUNTER_MAP[pending.type]) return null
  if (typeof pending.originPlanetId !== 'string' || !PLANET_MAP[pending.originPlanetId]) return null
  if (
    typeof pending.destinationPlanetId !== 'string' ||
    !PLANET_MAP[pending.destinationPlanetId] ||
    pending.destinationPlanetId === pending.originPlanetId
  ) {
    return null
  }
  const departureDay = wholeOrUndef(pending.departureDay)
  const triggerDay = wholeOrUndef(pending.triggerDay)
  const journeyDays = wholeOrUndef(pending.journeyDays)
  if (departureDay === undefined || triggerDay === undefined || journeyDays === undefined) {
    return null
  }
  // The encounter interrupts a jump: it fires somewhere inside the flight, and
  // the flight always leaves at least its last day to be flown.
  if (journeyDays < 1) return null
  if (triggerDay < departureDay || triggerDay - departureDay > journeyDays - 1) return null
  const fuelCost = wholeOrUndef(pending.fuelCost)

  const id =
    typeof pending.id === 'string' && pending.id.length > 0
      ? pending.id
      : encounterId(
          `${pending.originPlanetId}>${pending.destinationPlanetId}@${departureDay}#${Math.max(
            0,
            tripsMade - 1,
          )}`,
        )

  return {
    id,
    type: pending.type,
    originPlanetId: pending.originPlanetId,
    destinationPlanetId: pending.destinationPlanetId,
    departureDay,
    triggerDay,
    journeyDays,
    fuelCost: fuelCost ?? 0,
  }
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