export type CommodityId =
  | 'food'
  | 'water'
  | 'fuel'
  | 'metals'
  | 'electronics'
  | 'medicine'
  | 'luxury'
  | 'crystals'

export interface Commodity {
  id: CommodityId
  name: string
  icon: string
  basePrice: number
  description: string
}

export type PlanetType =
  | 'agricultural'
  | 'industrial'
  | 'mining'
  | 'technological'
  | 'wealthy'
  | 'frontier'

export interface Planet {
  id: string
  name: string
  type: PlanetType
  icon: string
  description: string
  position: { x: number; y: number }
  priceMods: Record<CommodityId, number>
  population: number
}

export interface MarketListing {
  price: number
  prevPrice: number
  stock: number
  stockMax: number
  baseStock: number
}

export type Markets = Record<string, Record<CommodityId, MarketListing>>

export type ShipUpgradeType = 'cargo' | 'engine' | 'nav'

export interface Ship {
  name: string
  className: string
  cargoLevel: number
  engineLevel: number
  navLevel: number
}

export interface Cargo {
  crystals: number
  electronics: number
  food: number
  fuel: number
  luxury: number
  medicine: number
  metals: number
  water: number
}

export interface Stats {
  /**
   * Realised trading profit: what sales paid out, less what the goods sold
   * cost.
   *
   * Named for exactly that, and never "total profit". It excludes fuel,
   * upkeep and upgrade spend, all of which are running costs of the business
   * rather than the result of trading it - and it can run negative while a
   * player is still very much in profit overall. The label used to read
   * "Lifetime profit" / "Total Profit", which invited the reading that this
   * was money made. Net worth is the game's measure of that; this is the
   * measure of the trading.
   */
  tradingProfit: number
  goodsBought: number
  goodsSold: number
  tripsMade: number
  upgradesInvested: number
  maxNetWorth: number
  victory: boolean
  victorySeen: boolean
  victoryDay: number | null
}

export interface LogEntry {
  day: number
  icon: string
  text: string
}

/** One of the temporary market events in `MARKET_EVENTS`. */
export type MarketEventType = string

/**
 * A market event happening at one planet on a known span of days.
 *
 * Only what cannot be read back out of `eventType` is stored. The name,
 * description and price modifiers all come from the event's definition, and
 * no price is stored at all - the event is a multiplier the existing market
 * calculation applies, so there is exactly one place a price is worked out.
 *
 * `id` is derived from (type, planet, startDay) rather than generated, so a
 * replayed save rebuilds the same ids and the same events.
 */
export interface MarketEvent {
  id: string
  eventType: MarketEventType
  planetId: string
  startDay: number
  /** The first day the event is *no longer* active. */
  endDay: number
}

export interface GameState {
  version: number
  createdAt: number
  updatedAt: number
  day: number
  credits: number
  planetId: string
  ship: Ship
  cargo: Cargo
  costBasis: Partial<Record<CommodityId, number>>
  markets: Markets
  /**
   * Market events currently running anywhere in the sector, newest span
   * included. Only active events are kept: each is dropped the day after it
   * expires, so this never grows into a schedule of future events.
   */
  activeEvents: MarketEvent[]
  stats: Stats
  log: LogEntry[]
}