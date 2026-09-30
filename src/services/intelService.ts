import type { CommodityId, GameState } from '../types/game'
import { COMMODITY_MAP, PLANETS, PLANET_MAP, cargoCapacityAtLevel } from '../data/gameData'
import { projectListing, quoteBuy, quoteSell } from './marketService'
import { distanceBetween, travelCost } from './travelService'

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
  travelDays: number
}

/**
 * Returns the best buy->sell opportunities visible from the player's
 * current planet. Used to render market intelligence once the Navigation
 * Array upgrade is purchased.
 *
 * Each lead is sized to a realistic run: how much of the commodity you
 * could load right now (cargo space, local stock, credits left after that
 * destination's fuel) and the net profit after the one-way fuel cost.
 *
 * Both ends of the run are quoted the way the trade will actually settle,
 * not at the prices on screen right now. The destination re-prices once per
 * day of travel, and each side moves against you the moment you trade - so
 * quoting sticker prices promises profit the run cannot deliver.
 */
/**
 * Leads are pure in `state`, and quoting one walks the book across every
 * commodity/planet pair, so cache by state identity: the panel re-renders far
 * more often than the game commits a new state.
 */
const leadCache = new WeakMap<GameState, TradeLead[]>()

export function getTradeLeads(state: GameState): TradeLead[] {
  const cached = leadCache.get(state)
  if (cached) return cached
  const leads = computeTradeLeads(state)
  leadCache.set(state, leads)
  return leads
}

function computeTradeLeads(state: GameState): TradeLead[] {
  const currentPlanet = PLANET_MAP[state.planetId]
  if (!currentPlanet) return []

  const prices = state.markets[state.planetId]
  if (!prices) return []

  const capacity = cargoCapacityAtLevel(state.ship.cargoLevel)
  const cargoUsed = Object.values(state.cargo).reduce((sum, q) => sum + q, 0)
  const freeSpace = Math.max(0, capacity - cargoUsed)

  const leads: TradeLead[] = []

  for (const commodity of Object.values(COMMODITY_MAP)) {
    const listing = prices[commodity.id]
    if (!listing || listing.price <= 0) continue
    if (listing.stock <= 0 || freeSpace <= 0) continue

    let best: {
      planetId: string
      buy: number
      sell: number
      profit: number
      runQty: number
      days: number
    } | null = null

    for (const planet of PLANETS) {
      if (planet.id === state.planetId) continue
      const sellListing = state.markets[planet.id]?.[commodity.id]
      if (!sellListing) continue

      const days = distanceBetween(currentPlanet, planet)
      const travel = travelCost(state, planet.id)
      // The run has to be executable: after paying for the cargo, the
      // remaining credits still have to cover the fuel for THIS destination.
      const budget = state.credits - travel
      const cap = Math.min(freeSpace, listing.stock)

      // The buy price rises with every unit drained from the origin, so the
      // largest affordable load is found by bisection rather than a single
      // divide - the price is a function of the quantity.
      let lo = 0
      let hi = cap
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (quoteBuy(currentPlanet, commodity, listing, mid, state.day).cost <= budget) lo = mid
        else hi = mid - 1
      }
      const runQty = lo
      if (runQty <= 0) continue

      const buyQuote = quoteBuy(currentPlanet, commodity, listing, runQty, state.day)
      // The destination re-prices once per day of travel, so quote the market
      // as it will actually stand on arrival - then apply the impact of
      // dumping the load into it, since `sellCommodity` prices the same way.
      const arrivalDay = state.day + days
      const onArrival = projectListing(planet.id, commodity.id, sellListing, state.day, days)
      const sellQuote = quoteSell(planet, commodity, onArrival, runQty, arrivalDay)
      const buy = buyQuote.unitPrice
      const sell = sellQuote.unitPrice

      // Net is taken from the two whole-credit totals rather than from the
      // average unit prices: multiplying the averages back out by `runQty`
      // reintroduces float error (a quoted 252.99999999999994 against a
      // realised 253), and the totals are what the run actually banks.
      const net = sellQuote.proceeds - buyQuote.cost - travel
      if (net > 0 && (!best || net > best.profit)) {
        best = { planetId: planet.id, buy, sell, profit: net, runQty, days }
      }
    }

    if (best) {
      leads.push({
        commodityId: commodity.id,
        commodityName: commodity.name,
        icon: commodity.icon,
        originPlanetName: currentPlanet.name,
        originPrice: best.buy,
        targetPlanetId: best.planetId,
        targetPlanetName: PLANET_MAP[best.planetId].name,
        targetPrice: best.sell,
        spread: best.sell - best.buy,
        holding: state.cargo[commodity.id] ?? 0,
        runQty: best.runQty,
        runProfit: best.profit,
        travelDays: best.days,
      })
    }
  }

  return leads.sort((a, b) => b.runProfit - a.runProfit)
}
