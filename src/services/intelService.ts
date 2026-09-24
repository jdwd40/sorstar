import type { CommodityId, GameState } from '../types/game'
import { COMMODITY_MAP, PLANETS, PLANET_MAP, cargoCapacityAtLevel } from '../data/gameData'
import { stockFactor } from './marketService'
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
* could load right now (cargo space, local stock, credits left after that
 * destination's fuel) and the net profit after the one-way fuel cost.
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
    if (stock <= 0 || freeSpace <= 0) continue

    let best: { planetId: string; price: number; profit: number; runQty: number } | null = null
    for (const planet of PLANETS) {
      if (planet.id === state.planetId) continue
      const sellListing = state.markets[planet.id]?.[commodity.id]
      if (!sellListing) continue
      const travel = travelCost(state, planet.id)
      // The run must actually be executable: after spending credits on cargo,
      // the leftover still has to cover fuel for THIS destination. Sizing the
      // load against the target's fuel keeps the panel from quoting a profit
      // that Travel then blocks with "not enough credits for fuel".
      const runQty = Math.min(freeSpace, stock, Math.max(0, Math.floor((state.credits - travel) / buy)))
      if (runQty <= 0) continue
      // Selling `runQty` into the target market raises its stock and drops the
      // price (marketService applies the same feedback), so quote the profit at
      // the *impacted* sell price - not the pre-sale sticker price.
      const stockAfter = Math.min(sellListing.stockMax, sellListing.stock + runQty)
      const impactRatio =
        stockFactor(stockAfter, sellListing.baseStock) / stockFactor(sellListing.stock, sellListing.baseStock)
      const sellPriceAfter = Math.max(1, Math.round(sellListing.price * impactRatio))
      const net = (sellPriceAfter - buy) * runQty - travel
      if (net > 0 && (!best || net > best.profit)) {
        best = { planetId: planet.id, price: sellListing.price, profit: net, runQty }
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
runQty: best.runQty,
        runProfit: best.profit,
      })
    }
  }

  return leads.sort((a, b) => b.runProfit - a.runProfit)
}