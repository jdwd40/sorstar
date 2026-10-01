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
  stats: Stats
  log: LogEntry[]
}