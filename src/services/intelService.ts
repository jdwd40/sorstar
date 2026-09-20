import type { CommodityId, GameState } from '../types/game'
import { CARGO_UPGRADES, COMMODITY_MAP, PLANETS, PLANET_MAP } from '../data/gameData'
import { travelCost } from './travelService'

export interface TradeLead {
  commodityId: CommodityId
  commodityName: string
  icon: string
  originPlanetName: string
  originPrice: number
  targetPlanetId: string
  targetPlanetName: string
  targetPrice: number
  spread: number
  holding: number
  runQty: number
  runProfit: number
}

/**
 * Returns the best buy->sell opportunities visible from the player's
 * current planet, based on live market prices. Used to render market
 * intelligence once the Navigation Array upgrade is purchased.
 *
 * Each lead is sized to a realistic run: how much of the commodity you
 * could load right now (cargo space, local stock, affordable credits)
 * and the net profit after the one-way fuel cost.
 */
export function getTradeLeads(state: GameState): TradeLead[] {
  const currentPlanet = PLANET_MAP[state.planetId]
  if (!currentPlanet) return []

  const prices = state.markets[state.planetId]
  if (!prices) return []

  const cargoTier = CARGO_UPGRADES.find((t) => t.level === state.ship.cargoLevel)
  const capacity = cargoTier ? cargoTier.capacity : CARGO_UPGRADES[0].capacity
  const cargoUsed = Object.values(state.cargo).reduce((sum, q) => sum + q, 0)
  const freeSpace = Math.max(0, capacity - cargoUsed)

  const leads: TradeLead[] = []

  for (const commodity of Object.values(COMMODITY_MAP)) {
    const buy = prices[commodity.id].price
    if (buy <= 0) continue

    const affordable = Math.floor(state.credits / buy)
    const stock = prices[commodity.id].stock
    const runQtyRaw = Math.min(freeSpace, stock, affordable)
    if (runQtyRaw <= 0) continue

    let best: { planetId: string; price: number; profit: number } | null = null
    for (const planet of PLANETS) {
      if (planet.id === state.planetId) continue
      const sellListing = state.markets[planet.id]?.[commodity.id]
      if (!sellListing) continue
      const travel = travelCost(state, planet.id)
      const net = (sellListing.price - buy) * runQtyRaw - travel
      if (net > 0 && (!best || net > best.profit)) {
        best = { planetId: planet.id, price: sellListing.price, profit: net }
      }
    }

    if (best) {
      leads.push({
        commodityId: commodity.id,
        commodityName: commodity.name,
        icon: commodity.icon,
        originPlanetName: currentPlanet.name,
        originPrice: buy,
        targetPlanetId: best.planetId,
        targetPlanetName: PLANET_MAP[best.planetId].name,
        targetPrice: best.price,
        spread: best.price - buy,
        holding: state.cargo[commodity.id] ?? 0,
        runQty: runQtyRaw,
        runProfit: best.profit,
      })
    }
  }

  return leads.sort((a, b) => b.runProfit - a.runProfit)
}