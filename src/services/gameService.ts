import type { Commodity, GameState, LogEntry } from '../types/game'
import {
  COMMODITIES,
  GAME_TARGET_NET_WORTH,
  GAME_VERSION,
  LOG_LIMIT,
  PLANETS,
  STARTING_CREDITS,
  STARTING_PLANET,
  STARTING_SHIP,
  PLANET_MAP,
} from '../data/gameData'
import { createMarkets } from './marketService'

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

export function withLog(state: GameState, icon: string, text: string): GameState {
  const entry: LogEntry = { day: state.day, icon, text }
  const log = [entry, ...state.log].slice(0, LOG_LIMIT)
  return { ...state, log }
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
    stats: {
      totalProfit: 0,
      goodsBought: 0,
      goodsSold: 0,
      tripsMade: 0,
      upgradesInvested: 0,
      maxNetWorth: STARTING_CREDITS,
      victory: false,
      victorySeen: false,
      victoryDay: null,
    },
    log: [],
  }
  const planetName = PLANET_MAP[STARTING_PLANET]?.name ?? STARTING_PLANET
  return withLog(starter, '📡', `You dock at ${planetName} with ${STARTING_CREDITS} cr and a fresh hold.`)
}

export function cargoValueAtPlanet(state: GameState): number {
  let total = 0
  for (const commodity of COMMODITIES) {
    const qty = state.cargo[commodity.id]
    if (qty <= 0) continue
    const price = state.markets[state.planetId]?.[commodity.id]?.price ?? commodity.basePrice
    total += qty * price
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
 * goal is meant to measure. `cargoValueAtPlanet` still reports the live
 * figure, as information rather than as an achievement.
 */
export function cargoEquity(state: GameState): number {
  let total = 0
  for (const commodity of COMMODITIES) {
    const qty = state.cargo[commodity.id]
    if (qty <= 0) continue
    total += qty * (state.costBasis[commodity.id] ?? commodity.basePrice)
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
  costBasis: number
  herePrice: number
  realized: number
  breakEven: number
}

/** Values currently carried in the hold, priced at the local market. */
export function carriedGoods(state: GameState): CarriedGood[] {
  const result: CarriedGood[] = []
  for (const commodity of COMMODITIES) {
    const qty = state.cargo[commodity.id]
    if (qty <= 0) continue
    const herePrice = state.markets[state.planetId]?.[commodity.id]?.price ?? commodity.basePrice
    const costBasis = state.costBasis[commodity.id] ?? herePrice
    result.push({
      commodity,
      qty,
      costBasis,
      herePrice,
      realized: qty * herePrice,
      breakEven: qty * costBasis,
    })
  }
  return result.sort((a, b) => b.realized - a.realized)
}