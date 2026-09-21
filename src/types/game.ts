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
  totalProfit: number
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