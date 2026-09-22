import type { CommodityId, GameState } from '../types/game'
import { COMMODITY_MAP, PLANETS, PLANET_MAP, cargoCapacityAtLevel } from '../data/gameData'
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
 * could load right now (cargo space, local stock, credits minus the fuel
 * needed for the jump) and the net profit after that one-way fuel cost.
 */
export function getTradeLeads(state: GameState): TradeLead[] {
  const currentPlanet = PLANET_MAP[state.planetId]
  if (!currentPlanet) return []

  const prices = state.markets[state.planetId]
  if (!prices) return []

  const capacity = cargoCapacityAtLevel(state.ship.cargoLevel)
  const cargoUsed = Object.values(state.cargo).reduce((sum, q) => sum + q, 0)
  const freeSpace = Math.max(0, capacity - cargoUsed)

  const leads: TradeLead[] = []

  for (const commodity of Object.values(COMMODITY_MAP)) {
    const buy = prices[commodity.id].price
    if (buy <= 0) continue

    const stock = prices[commodity.id].stock

    let best: { planetId: string; price: number; profit: number; qty: number } | null = null
    for (const planet of PLANETS) {
      if (planet.id === state.planetId) continue
      const sellListing = state.markets[planet.id]?.[commodity.id]
      if (!sellListing) continue
      const travel = travelCost(state, planet.id)
      const affordable = Math.max(0, Math.floor((state.credits - travel) / buy))
      const qty = Math.min(freeSpace, stock, affordable)
      if (qty <= 0) continue
      const net = (sellListing.price - buy) * qty - travel
      if (net > 0 && (!best || net > best.profit)) {
        best = { planetId: planet.id, price: sellListing.price, profit: net, qty }
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
        runQty: best.qty,
        runProfit: best.profit,
      })
    }
  }

  return leads.sort((a, b) => b.runProfit - a.runProfit)
}