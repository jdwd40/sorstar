import type { CommodityId, GameState } from '../types/game'
import { COMMODITY_MAP, PLANETS, PLANET_MAP, cargoCapacityAtLevel, distanceBetween } from '../data/gameData'
import { DAILY_PRICE_DRIFT, projectStock, quoteBuy, quoteSellForecast } from './marketService'
import { commodityEventScale } from './marketEventService'
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
  /**
   * Expected net profit. The *expected* sell price is knowable - it is the
   * market's structural value on arrival - but the day's drift is not, so this
   * is a fair average over outcomes rather than a promise. `worstCase` and
   * `bestCase` are the same run at the edges of the drift.
   */
  runProfit: number
  sellPriceLow: number
  sellPriceHigh: number
  worstCase: number
  bestCase: number
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
 * The cost side is exact and the return side is not, which is the whole point.
 * You can see today's price at the origin, and you know the destination's stock
 * will have regenerated on the way - so what you will *pay* is knowable. What
 * you will *get* is not: each market also carries a daily drift the player
 * cannot observe until they arrive. So leads quote an expected profit bracketed
 * by the drift, and the Navigation Array is a forecast rather than a solution.
 * Quoting the exact arrival price was possible - the drift is a pure function
 * of (planet, commodity, day) - but it made the mid-game arithmetic instead of
 * a judgement call.
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
  const events = state.activeEvents
  // The origin's own market, priced today: an event running here is part of
  // what the run starts from.
  const originScale = (id: CommodityId) => commodityEventScale(events, state.planetId, id, state.day)

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
      sellLow: number
      sellHigh: number
      worstCase: number
      bestCase: number
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
      const hereScale = originScale(commodity.id)

      // The buy price rises with every unit drained from the origin, so the
      // largest affordable load is found by bisection rather than a single
      // divide - the price is a function of the quantity.
      let lo = 0
      let hi = cap
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (quoteBuy(currentPlanet, commodity, listing, mid, state.day, hereScale).cost <= budget) lo = mid
        else hi = mid - 1
      }
      const runQty = lo
      if (runQty <= 0) continue

      const buyQuote = quoteBuy(currentPlanet, commodity, listing, runQty, state.day, hereScale)
      // The destination re-prices once per day of travel, so quote the market
      // as it will actually stand on arrival - then apply the impact of
      // dumping the load into it, since `sellCommodity` prices the same way.
      const onArrival = { ...sellListing, stock: projectStock(sellListing, days) }

      // A market event the player can already see is known news, so it goes
      // into the forecast rather than the band - but only if it is still
      // running on the arrival day. One that expires in transit is not, and
      // pricing it in would promise a shortage that has already ended. Events
      // that have not started yet are not knowable, and are not predicted.
      const arrivalScale = commodityEventScale(
        events,
        planet.id,
        commodity.id,
        state.day + days,
      )

      // Forecast, not a quote. `quoteSell` knows the arrival price exactly,
      // because the day's drift is a pure function of (planet, commodity, day)
      // - so routing intel through it handed the player a solved problem and
      // turned the Navigation Array into a calculator. The forecast prices the
      // destination on its structural value, which is the expectation, and
      // brackets it with the drift it cannot see.
      const forecast = quoteSellForecast(planet, commodity, onArrival, runQty, 1, arrivalScale)
      const low = quoteSellForecast(
        planet,
        commodity,
        onArrival,
        runQty,
        1 - DAILY_PRICE_DRIFT,
        arrivalScale,
      )
      const high = quoteSellForecast(
        planet,
        commodity,
        onArrival,
        runQty,
        1 + DAILY_PRICE_DRIFT,
        arrivalScale,
      )
      const sell = forecast.unitPrice

      // Net is taken from the whole-credit totals rather than from the average
      // unit prices: multiplying the averages back out by `runQty` reintroduces
      // float error, and the totals are what the run actually banks.
      const spend = buyQuote.cost + travel
      const net = forecast.proceeds - spend
      if (net > 0 && (!best || net > best.profit)) {
        best = {
          planetId: planet.id,
          buy: buyQuote.unitPrice,
          sell,
          sellLow: low.unitPrice,
          sellHigh: high.unitPrice,
          profit: net,
          // Taken from the whole-credit totals, not rebuilt by multiplying the
          // average unit price back out by `runQty` - that reintroduces float
          // error and leaves the band a hair wider than the outcomes it is
          // supposed to bracket.
          worstCase: low.proceeds - spend,
          bestCase: high.proceeds - spend,
          runQty,
          days,
        }
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
        sellPriceLow: best.sellLow,
        sellPriceHigh: best.sellHigh,
        worstCase: best.worstCase,
        bestCase: best.bestCase,
        travelDays: best.days,
      })
    }
  }

  return leads.sort((a, b) => b.runProfit - a.runProfit)
}
