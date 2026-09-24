import type { CommodityId, GameState, MarketListing } from '../types/game'
import { COMMODITY_MAP, GAME_VERSION, PLANETS, PLANET_MAP } from '../data/gameData'

function assertNumber(v: unknown, label: string): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Corrupt save: ${label} must be a number`)
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

  if (!raw.cargo || typeof raw.cargo !== 'object') {
    throw new Error('Corrupt save: cargo missing')
  }
  for (const cid of commodityIds) {
    assertNumber(raw.cargo[cid], `cargo ${cid}`)
  }

  if (!raw.stats || typeof raw.stats !== 'object') {
    throw new Error('Corrupt save: stats missing')
  }

  if (!raw.ship || typeof raw.ship !== 'object') {
    throw new Error('Corrupt save: ship missing')
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

  if (state.version < GAME_VERSION) {
    state = { ...state, version: GAME_VERSION }
  }
  return state
}