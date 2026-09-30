import type {
  Commodity,
  CommodityId,
  Planet,
  PlanetType,
  Ship,
  ShipUpgradeType,
} from '../types/game'

export const GAME_TARGET_NET_WORTH = 100_000
export const GAME_VERSION = 2
export const STARTING_CREDITS = 1200
export const STARTING_PLANET = 'eden'
export const SAVE_KEY = 'sorstar.save.v2'
export const LOG_LIMIT = 80

// See `dailyUpkeep`. Kept as named constants so the balance is tunable in one
// place and the verify script can assert the cap.
export const UPKEEP_BASE = 1
export const UPKEEP_NAV_MULTIPLIER = 2
export const UPKEEP_MAX = 13

export const COMMODITIES: Commodity[] = [
  {
    id: 'food',
    name: 'Food',
    icon: '🌾',
    basePrice: 15,
    description: 'Basic nutrition, always in demand.',
  },
  {
    id: 'water',
    name: 'Water',
    icon: '💧',
    basePrice: 8,
    description: 'Essential for every colony.',
  },
  {
    id: 'fuel',
    name: 'Fuel',
    icon: '⛽',
    basePrice: 20,
    description: 'Power for engines and industry.',
  },
  {
    id: 'metals',
    name: 'Metals',
    icon: '🔩',
    basePrice: 35,
    description: 'Raw alloys for construction.',
  },
  {
    id: 'electronics',
    name: 'Electronics',
    icon: '🖥️',
    basePrice: 75,
    description: 'Advanced components for tech worlds.',
  },
  {
    id: 'medicine',
    name: 'Medicine',
    icon: '💊',
    basePrice: 65,
    description: 'Pharmaceuticals for the frontier.',
  },
  {
    id: 'luxury',
    name: 'Luxury Goods',
    icon: '💎',
    basePrice: 150,
    description: 'Fine goods for wealthy citizens.',
  },
  {
    id: 'crystals',
    name: 'Rare Crystals',
    icon: '✨',
    basePrice: 280,
    description: 'Exotic crystals for advanced tech.',
  },
]

export const COMMODITY_MAP: Record<CommodityId, Commodity> = COMMODITIES.reduce(
  (acc, c) => {
    acc[c.id] = c
    return acc
  },
  {} as Record<CommodityId, Commodity>,
)

const mods = (
  overrides: Partial<Record<CommodityId, number>>,
): Record<CommodityId, number> => {
  const base: Record<CommodityId, number> = {
    food: 1,
    water: 1,
    fuel: 1,
    metals: 1,
    electronics: 1,
    medicine: 1,
    luxury: 1,
    crystals: 1,
  }
  return { ...base, ...overrides }
}

const planet = (
  id: string,
  name: string,
  type: PlanetType,
  icon: string,
  description: string,
  position: { x: number; y: number },
  priceMods: Partial<Record<CommodityId, number>>,
  population: number,
): Planet => ({
  id,
  name,
  type,
  icon,
  description,
  position,
  priceMods: mods(priceMods),
  population,
})

export const PLANETS: Planet[] = [
  planet(
    'eden',
    'Eden Prime',
    'agricultural',
    '🌾',
    'A breadbasket world of lush farms. Grain and produce flow out to the whole sector.',
    { x: 30, y: 65 },
    { food: 0.65, water: 0.7, electronics: 1.5, luxury: 1.5, medicine: 1.3, metals: 1.25, crystals: 1.55 },
    4_200_000,
  ),
  planet(
    'korbant',
    'Korbant Reach',
    'mining',
    '⛏️',
    'Harsh canyonworld furrowed by strip mines. Metals fuel the sector economy.',
    { x: 75, y: 25 },
    { metals: 0.55, fuel: 0.7, food: 1.4, water: 1.3, electronics: 1.55, medicine: 1.5, luxury: 1.6, crystals: 1.5 },
    1_100_000,
  ),
  planet(
    'nextera',
    'Nextera',
    'technological',
    '🔬',
    'A gleaming research hub. Cutting-edge electronics and medicine are forged here.',
    { x: 70, y: 78 },
    { electronics: 0.55, medicine: 0.65, food: 1.4, water: 1.35, metals: 1.4, fuel: 1.3, luxury: 1.2, crystals: 0.9 },
    6_500_000,
  ),
  planet(
    'aurelia',
    'Aurelia Prime',
    'wealthy',
    '🏛️',
    'The glittering capital of the sector. Wealthy citizens pay handsomely for the finer things.',
    { x: 50, y: 20 },
    { luxury: 0.6, crystals: 0.75, food: 1.5, water: 1.4, metals: 1.3, fuel: 1.2, electronics: 0.95, medicine: 0.9 },
    9_000_000,
  ),
  planet(
    'vorgon',
    'Vorgon Foundry',
    'industrial',
    '🏭',
    'A smog-choked factory world. Its automated foundries churn out heavy machinery.',
    { x: 25, y: 30 },
    { metals: 0.6, fuel: 0.65, electronics: 0.9, food: 1.35, water: 1.3, medicine: 1.4, luxury: 1.6, crystals: 1.5 },
    2_800_000,
  ),
  planet(
    'drax',
    'Drax-7',
    'frontier',
    '🚀',
    'A rough-and-tumble frontier station. Everything is scarce here except dust and trouble.',
    { x: 15, y: 85 },
    { water: 1.55, food: 1.5, electronics: 1.7, medicine: 1.7, luxury: 1.8, metals: 1.25, fuel: 1.4, crystals: 1.4 },
    350_000,
  ),
  planet(
    'ironreach',
    'Ironreach Colony',
    'mining',
    '⛏️',
    'A young asteroid colony with rich mineral veins and hungry miners.',
    { x: 55, y: 55 },
    { metals: 0.5, fuel: 0.8, food: 1.4, water: 1.4, electronics: 1.5, medicine: 1.5, luxury: 1.6, crystals: 1.35 },
    680_000,
  ),
  planet(
    'straton',
    'Straton Core',
    'technological',
    '🔬',
    'The densest orbital network in the sector, home to megacorp R&D labs.',
    { x: 78, y: 48 },
    { electronics: 0.6, medicine: 0.7, luxury: 0.8, crystals: 0.8, food: 1.5, water: 1.4, metals: 1.3, fuel: 1.3 },
    11_000_000,
  ),
  planet(
    'telos',
    'Telos',
    'agricultural',
    '🌾',
    'A terraformed colony of orchards and fisheries, exporting premium produce.',
    { x: 12, y: 12 },
    { food: 0.55, water: 0.65, electronics: 1.6, medicine: 1.45, luxury: 1.5, metals: 1.35, fuel: 1.2, crystals: 1.1 },
    2_100_000,
  ),
]

export const PLANET_MAP: Record<string, Planet> = PLANETS.reduce(
  (acc, p) => {
    acc[p.id] = p
    return acc
  },
  {} as Record<string, Planet>,
)

export const PLANET_TYPE_META: Record<PlanetType, { icon: string; color: string }> = {
  agricultural: { icon: '🌾', color: 'text-emerald-400' },
  industrial: { icon: '🏭', color: 'text-slate-300' },
  mining: { icon: '⛏️', color: 'text-amber-400' },
  technological: { icon: '🔬', color: 'text-cyan-400' },
  wealthy: { icon: '🏛️', color: 'text-violet-400' },
  frontier: { icon: '🚀', color: 'text-orange-400' },
}

interface CargoTier {
  level: number
  cost: number
  capacity: number
}

interface EngineTier {
  level: number
  cost: number
  fuelPerLy: number
}

interface NavTier {
  level: number
  cost: number
}

export const CARGO_UPGRADES: CargoTier[] = [
  { level: 0, cost: 0, capacity: 12 },
  { level: 1, cost: 800, capacity: 20 },
  { level: 2, cost: 2200, capacity: 32 },
  { level: 3, cost: 5200, capacity: 48 },
  { level: 4, cost: 11000, capacity: 70 },
  { level: 5, cost: 23000, capacity: 100 },
]

export const ENGINE_UPGRADES: EngineTier[] = [
  { level: 0, cost: 0, fuelPerLy: 6 },
  { level: 1, cost: 600, fuelPerLy: 5 },
  { level: 2, cost: 1600, fuelPerLy: 4 },
  { level: 3, cost: 3800, fuelPerLy: 3 },
  { level: 4, cost: 8200, fuelPerLy: 2 },
  { level: 5, cost: 17000, fuelPerLy: 1.5 },
]

export const NAV_UPGRADES: NavTier[] = [
  { level: 0, cost: 0 },
  { level: 1, cost: 3500 },
]

export const UPGRADE_META: Record<
  ShipUpgradeType,
  { name: string; description: string; icon: string }
> = {
  cargo: {
    name: 'Cargo Hold',
    description: 'Increases the ship cargo capacity.',
    icon: '📦',
  },
  engine: {
    name: 'Warp Engine',
    description: 'Reduces fuel cost per light-year.',
    icon: '🚀',
  },
  nav: {
    name: 'Navigation Array',
    description: 'Unlocks market intelligence across the sector.',
    icon: '🛰️',
  },
}

export function cargoCapacityAtLevel(level: number): number {
  const tier = CARGO_UPGRADES.find((t) => t.level === level)
  return tier ? tier.capacity : CARGO_UPGRADES[0].capacity
}

export function fuelCostAtLevel(level: number): number {
  const tier = ENGINE_UPGRADES.find((t) => t.level === level)
  return tier ? tier.fuelPerLy : ENGINE_UPGRADES[0].fuelPerLy
}

/**
 * Daily berth and crew upkeep, charged when the player deliberately waits a day.
 *
 * Upgrades stay a trade-off rather than a pure upgrade: each cargo bay, engine
 * tier, and nav array costs more to keep than it returns, so waiting gets
 * progressively more expensive as the ship grows. Only manual waiting is
 * charged - jumping already prices the journey through fuel, and charging
 * upkeep on top of that would tax trading twice for the same days.
 *
 * Capped so a fully upgraded hull can never cost more than a round trip is
 * worth, which keeps a late-game idle loop from being ruinous by accident.
 */
export function dailyUpkeep(
  ship: Pick<Ship, 'cargoLevel' | 'engineLevel' | 'navLevel'>,
): number {
  const raw = UPKEEP_BASE + ship.cargoLevel + ship.engineLevel + ship.navLevel * UPKEEP_NAV_MULTIPLIER
  return Math.min(UPKEEP_MAX, Math.max(UPKEEP_BASE, raw))
}

export const STARTING_SHIP = {
  name: 'Starhopper',
  className: 'Light Freighter Mark I',
  cargoLevel: 0,
  engineLevel: 0,
  navLevel: 0,
}