import type {
  Commodity,
  CommodityId,
  GameState,
  MarketListing,
  Markets,
  Planet,
} from '../types/game'
import { COMMODITY_MAP, PLANET_MAP, cargoCapacityAtLevel } from '../data/gameData'

export function hashString(str: string): number {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function randomFactor(planetId: string, commodityId: string, day: number): number {
  const h = hashString(`${planetId}:${commodityId}:${day}`)
  return 0.96 + (h % 1000) / 1000 * 0.08
}

const baseStockFor = (commodityId: CommodityId): number => {
  switch (commodityId) {
    case 'food': return 200
    case 'water': return 220
    case 'fuel': return 160
    case 'metals': return 140
    case 'electronics': return 110
    case 'medicine': return 100
    case 'luxury': return 70
    case 'crystals': return 45
  }
}

export function stockFactor(stock: number, baseStock: number): number {
  const s = Math.max(0, stock)
  return 1 + ((baseStock - s) / baseStock) * 0.6
}

export function marketPrice(
  planet: Planet,
  commodity: Commodity,
  listing: MarketListing,
  day: number,
): number {
  const factor =
    planet.priceMods[commodity.id] * stockFactor(listing.stock, listing.baseStock)
  return Math.max(1, Math.round(commodity.basePrice * factor * randomFactor(planet.id, commodity.id, day)))
}

function priceDelta(listing: MarketListing): number {
  return listing.price - listing.prevPrice
}

export function priceDirection(listing: MarketListing): 'up' | 'down' | 'flat' {
  const d = priceDelta(listing)
  if (d > 0) return 'up'
  if (d < 0) return 'down'
  return 'flat'
}

export function createPlanetMarket(planet: Planet, day: number): Record<CommodityId, MarketListing> {
  const result = {} as Record<CommodityId, MarketListing>
  for (const commodity of Object.values(COMMODITY_MAP)) {
    const mod = Math.max(0.4, planet.priceMods[commodity.id])
    const baseStock = Math.max(
      40,
      Math.round(baseStockFor(commodity.id) / mod),
    )
    const stockMax = Math.min(2000, Math.round(baseStock * 1.5))
    const stock = stockMax
    const listing: MarketListing = { price: 0, prevPrice: 0, stock, stockMax, baseStock }
    listing.price = marketPrice(planet, commodity, listing, day)
    listing.prevPrice = listing.price
    result[commodity.id] = listing
  }
  return result
}

export function createMarkets(planetIds: string[], day: number): Markets {
  const markets: Markets = {}
  for (const pid of planetIds) {
    const planet = PLANET_MAP[pid]
    if (!planet) continue
    markets[pid] = createPlanetMarket(planet, day)
  }
  return markets
}

export function refreshPrice(
  market: Record<CommodityId, MarketListing>,
  planetId: string,
  commodityId: CommodityId,
  day: number,
): void {
  const planet = PLANET_MAP[planetId]
  const listing = market[commodityId]
  if (!planet || !listing) return
  listing.price = marketPrice(planet, COMMODITY_MAP[commodityId], listing, day)
}

export function buyCommodity(
  state: GameState,
  commodityId: CommodityId,
  qty: number,
): { state: GameState; error?: string } {
  const listing = state.markets[state.planetId]?.[commodityId]
  const planet = PLANET_MAP[state.planetId]
  if (!planet || !listing) return { state, error: 'No market here.' }
  if (qty <= 0) return { state, error: 'Enter a quantity first.' }

  const capacity = cargoCapacityAtLevel(state.ship.cargoLevel)
  const used = cargoUsed(state)
  const space = capacity - used
  if (qty > space) return { state, error: `Not enough cargo space (${space} free).` }
  if (listing.stock < qty) return { state, error: 'Not enough stock on this market.' }

  const cost = qty * listing.price
  if (cost > state.credits) return { state, error: `Not enough credits (need ${cost}).` }

  const ownedBefore = state.cargo[commodityId]
  const ownedAfter = ownedBefore + qty
  const basisBefore = state.costBasis[commodityId] ?? listing.price
  const costBasisAfter =
    ownedBefore + qty > 0
      ? (basisBefore * ownedBefore + cost) / ownedAfter
      : listing.price

  const nextCargo = { ...state.cargo, [commodityId]: ownedAfter }
  const nextCostBasis = { ...state.costBasis, [commodityId]: costBasisAfter }
  const nextMarket = { ...state.markets[state.planetId], [commodityId]: { ...listing, stock: listing.stock - qty } }
  refreshPrice(nextMarket, state.planetId, commodityId, state.day)
  nextMarket[commodityId].prevPrice = nextMarket[commodityId].price
  const nextMarkets = {
    ...state.markets,
    [state.planetId]: nextMarket,
  }

  return {
    state: {
      ...state,
      credits: state.credits - cost,
      cargo: nextCargo,
      costBasis: nextCostBasis,
      markets: nextMarkets,
      stats: {
        ...state.stats,
        goodsBought: state.stats.goodsBought + qty,
      },
    },
  }
}

export function sellCommodity(
  state: GameState,
  commodityId: CommodityId,
  qty: number,
): { state: GameState; error?: string } {
  const listing = state.markets[state.planetId]?.[commodityId]
  const planet = PLANET_MAP[state.planetId]
  if (!planet || !listing) return { state, error: 'No market here.' }
  if (qty <= 0) return { state, error: 'Enter a quantity first.' }

  const owned = state.cargo[commodityId]
  if (owned < qty) return { state, error: `You only have ${owned} ${COMMODITY_MAP[commodityId].name}.` }

  const proceeds = qty * listing.price
  const basis = state.costBasis[commodityId] ?? listing.price
  const profit = proceeds - basis * qty
  const nextStock = Math.min(listing.stockMax, listing.stock + qty)
  const nextMarket = {
    ...state.markets[state.planetId],
    [commodityId]: { ...listing, stock: nextStock },
  }
  refreshPrice(nextMarket, state.planetId, commodityId, state.day)
  nextMarket[commodityId].prevPrice = nextMarket[commodityId].price
  const nextMarkets = {
    ...state.markets,
    [state.planetId]: nextMarket,
  }

  return {
    state: {
      ...state,
      credits: state.credits + proceeds,
      cargo: { ...state.cargo, [commodityId]: owned - qty },
      markets: nextMarkets,
      stats: {
        ...state.stats,
        totalProfit: state.stats.totalProfit + profit,
        goodsSold: state.stats.goodsSold + qty,
      },
    },
  }
}

export function advanceDay(state: GameState): GameState {
  const day = state.day + 1
  const nextMarkets: Markets = {}
  for (const [planetId, record] of Object.entries(state.markets)) {
    const planet = PLANET_MAP[planetId]
    if (!planet) {
      nextMarkets[planetId] = record
      continue
    }
    const nextRecord = {} as Record<CommodityId, MarketListing>
    for (const commodityId of Object.keys(record) as CommodityId[]) {
      const listing = record[commodityId]
      const base = listing.baseStock
      const regen = Math.max(0, listing.stock + (base - listing.stock) * 0.2)
      const stock = Math.max(0, Math.min(listing.stockMax, Math.round(regen)))
      const nextListing: MarketListing = { ...listing, stock, prevPrice: listing.price }
      nextRecord[commodityId] = nextListing
    }
    for (const commodityId of Object.keys(nextRecord) as CommodityId[]) {
      refreshPrice(nextRecord, planetId, commodityId, day)
    }
    nextMarkets[planetId] = nextRecord
  }
  return { ...state, day, markets: nextMarkets }
}

export function cargoUsed(state: GameState): number {
  return Object.values(state.cargo).reduce((sum, qty) => sum + qty, 0)
}

export function cargoFree(state: GameState): number {
  return Math.max(0, cargoCapacityAtLevel(state.ship.cargoLevel) - cargoUsed(state))
}