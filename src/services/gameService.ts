import type { Commodity, GameState } from '../types/game'
import {
  COMMODITIES,
  GAME_TARGET_NET_WORTH,
  GAME_VERSION,
  PLANETS,
  STARTING_CREDITS,
  STARTING_PLANET,
  STARTING_SHIP,
  PLANET_MAP,
  withLog,
} from '../data/gameData'
import { createMarkets, cargoBasisAt, saleValue } from './marketService'
import { settleContracts } from './contractService'

function emptyCargo() {
  return {
    food: 0,
    water: 0,
    fuel: 0,
    metals: 0,
    electronics: 0,
    medicine: 0,
    luxury: 0,
    crystals: 0,
  }
}

export function createNewGame(version = GAME_VERSION): GameState {
  const day = 1
  const starter: GameState = {
    version,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    day,
    credits: STARTING_CREDITS,
    planetId: STARTING_PLANET,
    ship: { ...STARTING_SHIP },
    cargo: emptyCargo(),
    costBasis: {},
    markets: createMarkets(PLANETS.map((p) => p.id), day),
    // Day one is a quiet sector: the first event is drawn when the day advances,
    // so a new game opens on prices the player can reason about.
    activeEvents: [],
    // Filled in by `settleContracts` below, which is also what tops the board
    // back up as days pass. Day one already has a full board, so contracts are
    // something the player finds rather than something they wait for.
    contracts: [],
    // No journey is under way in a new game. Non-null means a jump was
    // interrupted and is waiting on an encounter.
    pendingEncounter: null,
    stats: {
      tradingProfit: 0,
      goodsBought: 0,
      goodsSold: 0,
      tripsMade: 0,
      upgradesInvested: 0,
      maxNetWorth: STARTING_CREDITS,
      victory: false,
      victorySeen: false,
      victoryDay: null,
      contractRevenue: 0,
      contractsCompleted: 0,
      contractsFailed: 0,
    },
    log: [],
  }
  const planetName = PLANET_MAP[STARTING_PLANET]?.name ?? STARTING_PLANET
  return settleContracts(withLog(starter, '📡', `You dock at ${planetName} with ${STARTING_CREDITS} cr and a fresh hold.`))
}

/**
 * What the whole hold would fetch if it were dumped on this market now.
 *
 * `saleValue` per line rather than `qty * listing.price`, so this is a figure a
 * sale can actually be held to. It is information only - net worth marks cargo
 * at cost - and the header says so wherever it is shown.
 */
export function cargoSaleValue(state: GameState): number {
  let total = 0
  for (const commodity of COMMODITIES) {
    const qty = state.cargo[commodity.id]
    if (qty <= 0) continue
    total += saleValue(state, commodity.id, qty)
  }
  return total
}

/**
 * What the hold is worth in equity terms: what you paid for it.
 *
 * Deliberately *not* the local market price. Marking cargo to the market made
 * net worth swing on the player's own trading - draining a market to buy
 * pushed the price up, which inflated the valuation of the very goods just
 * purchased, so buying inflated net worth and selling deflated it. Priced at
 * cost, net worth only moves when credits actually move, which is what the
 * goal is meant to measure. `saleValue` still reports the live figure, as
 * information rather than as an achievement.
 */
function cargoEquity(state: GameState): number {
  let total = 0
  for (const commodity of COMMODITIES) {
    const qty = state.cargo[commodity.id]
    if (qty <= 0) continue
    total += qty * cargoBasisAt(state, commodity.id)
  }
  return total
}

export function netWorth(state: GameState): number {
  return state.credits + cargoEquity(state) + state.stats.upgradesInvested
}

export function goalProgress(state: GameState): number {
  return Math.min(1, netWorth(state) / GAME_TARGET_NET_WORTH)
}

export interface CarriedGood {
  commodity: Commodity
  qty: number
  /** What the player paid per unit. */
  costBasis: number
  /** The listed price per unit at this market. */
  herePrice: number
  /**
   * What selling the whole line would credit, to the credit.
   *
   * Not `qty * herePrice`: a resting price is the price of the next unit, so
   * it ignores the impact of the line being dumped into the market. On a full
   * hold that overstates the figure by double digits. `saleValue` walks the
   * book exactly as the sale would, so this is the money, not an estimate.
   */
  sellsFor: number
  /** `qty * costBasis` - the credits already sunk into the line. */
  breakEven: number
}

/** Values currently carried in the hold, at what it would fetch right here. */
export function carriedGoods(state: GameState): CarriedGood[] {
  const result: CarriedGood[] = []
  for (const commodity of COMMODITIES) {
    const qty = state.cargo[commodity.id]
    if (qty <= 0) continue
    const herePrice = state.markets[state.planetId]?.[commodity.id]?.price ?? commodity.basePrice
    const costBasis = cargoBasisAt(state, commodity.id)
    result.push({
      commodity,
      qty,
      costBasis,
      herePrice,
      sellsFor: saleValue(state, commodity.id, qty),
      breakEven: qty * costBasis,
    })
  }
  return result.sort((a, b) => b.sellsFor - a.sellsFor)
}