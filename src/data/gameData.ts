import type {
  Commodity,
  CommodityId,
  GameState,
  LogEntry,
  MarketEventType,
  Planet,
  PlanetType,
  Ship,
  ShipUpgradeType,
  TravelEncounterType,
} from '../types/game'

export const GAME_TARGET_NET_WORTH = 100_000
export const GAME_VERSION = 6
export const STARTING_CREDITS = 1200
export const STARTING_PLANET = 'eden'
// Deliberately still "v2": the key names the *save*, not the schema, and
// bumping it on every schema change would strand every browser's save the one
// time it is least welcome. `migrate` is what carries a save forward.
export const SAVE_KEY = 'sorstar.save.v2'
export const LOG_LIMIT = 80

// See `dailyUpkeep`. The cap is exported so the verify script can assert it;
// the nav multiplier is not, because nothing outside this file reads it.
export const UPKEEP_BASE = 1
const UPKEEP_NAV_MULTIPLIER = 2
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

/**
 * A temporary market disruption. `modifiers` multiply the market's price for
 * the listed commodities while the event runs.
 *
 * Multipliers are kept between 0.70 and 1.50 on purpose. Events are meant to
 * open a short window to act on, not to print money: a swing much larger than
 * the daily drift would make a route worth taking or avoiding almost by
 * itself, and the player's own order impact would be a rounding error against
 * it.
 */
export interface MarketEventDefinition {
  type: MarketEventType
  name: string
  description: string
  modifiers: Partial<Record<CommodityId, number>>
}

export const MARKET_EVENTS: MarketEventDefinition[] = [
  {
    type: 'crop-failure',
    name: 'Crop Failure',
    description: 'Blight has taken the harvests. Food is suddenly scarce.',
    modifiers: { food: 1.45 },
  },
  {
    type: 'bumper-harvest',
    name: 'Bumper Harvest',
    description: 'The fields have never looked better. Food is glutted.',
    modifiers: { food: 0.75 },
  },
  {
    type: 'water-shortage',
    name: 'Water Shortage',
    description: 'Aquifers are running dry and every tanker is spoken for.',
    modifiers: { water: 1.45 },
  },
  {
    type: 'fuel-crisis',
    name: 'Fuel Crisis',
    description: 'Refinery output is down sector-wide. Fuel commands a premium.',
    modifiers: { fuel: 1.35 },
  },
  {
    type: 'mining-strike',
    name: 'Mining Strike',
    description: 'The pits are picket-lined. Metals are not moving.',
    modifiers: { metals: 1.4 },
  },
  {
    type: 'mineral-discovery',
    name: 'Mineral Discovery',
    description: 'A rich seam has been mapped. Metals are flooding the market.',
    modifiers: { metals: 0.75 },
  },
  {
    type: 'technology-expo',
    name: 'Technology Expo',
    description: 'Exhibitors are dumping surplus components. Electronics are cheap.',
    modifiers: { electronics: 0.8 },
  },
  {
    type: 'medical-emergency',
    name: 'Medical Emergency',
    description: 'An outbreak has emptied the shelves. Medicine is rationed.',
    modifiers: { medicine: 1.45 },
  },
  {
    type: 'luxury-festival',
    name: 'Luxury Festival',
    description: 'The season has opened and everyone wants the good life.',
    modifiers: { luxury: 1.35 },
  },
  {
    type: 'crystal-discovery',
    name: 'Crystal Discovery',
    description: 'A new crystal bed has been cut. Rare Crystals are cheap.',
    modifiers: { crystals: 0.75 },
  },
]

export const MARKET_EVENT_MAP: Record<string, MarketEventDefinition> = MARKET_EVENTS.reduce(
  (acc, e) => {
    acc[e.type] = e
    return acc
  },
  {} as Record<string, MarketEventDefinition>,
)

/**
 * Ceiling on events running anywhere in the sector at once.
 *
 * A handful, so an alert still means something: a screen full of them would
 * make every route unusual and no route worth acting on.
 */
export const MAX_ACTIVE_EVENTS = 3

/**
 * Chance a new event starts on a given day, out of 100. A flat roll, not a
 * guarantee - the target is roughly one event somewhere in the sector every
 * 3-5 days, and days that roll nothing simply have no event.
 */
export const EVENT_SPAWN_CHANCE_PERCENT = 25

/** Events run for 3-8 days: long enough to cross a short hop, short enough to matter. */
export const EVENT_MIN_DAYS = 3
export const EVENT_MAX_DAYS = 8

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
 * Light-years between two planets, and - because the engine burns one unit per
 * light-year - also the number of days a jump between them takes.
 *
 * Deliberately a property of the map rather than of the player: contracts price
 * and schedule a trip that has not been made yet, so this has to be answerable
 * for a route the ship is nowhere near. `travelService` reads it from here
 * rather than the other way round.
 */
export function distanceBetween(a: Planet, b: Planet): number {
  const dx = a.position.x - b.position.x
  const dy = a.position.y - b.position.y
  return Math.max(1, Math.round(Math.sqrt(dx * dx + dy * dy) / 10))
}

/**
 * Fuel bill in credits for a jump between two planets on a given engine tier.
 * Zero for an unknown planet or a jump to where you already are.
 */
export function fuelCostBetween(fromId: string, toId: string, engineLevel: number): number {
  const from = PLANET_MAP[fromId]
  const to = PLANET_MAP[toId]
  if (!from || !to || from.id === to.id) return 0
  return Math.max(1, Math.round(distanceBetween(from, to) * fuelCostAtLevel(engineLevel)))
}

/**
 * Appends one line to the flight log, newest first, trimmed to `LOG_LIMIT`.
 *
 * Lives here next to the cap rather than in `gameService` because trading,
 * travel, market events and contracts all write to the same log and must share
 * one limit - and because contracts settle inside `waitDay`/`travel`, below the
 * layer that imports `gameService`.
 */
export function withLog(state: GameState, icon: string, text: string): GameState {
  const entry: LogEntry = { day: state.day, icon, text }
  return { ...state, log: [entry, ...state.log].slice(0, LOG_LIMIT) }
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

/**
 * Delivery contracts: carry a load you bought yourself to a named planet by a
 * named day, and be paid a fixed fee for handing it over.
 *
 * A contract is a small second economy sitting on top of the market, never a
 * replacement for it. Nothing here is delivered for free: the goods are bought
 * from the same market every other trade uses, the reward is cash on top of a
 * trip the player chose, and neither price is touched by the contract.
 */

/** Jobs on the board at once. Small, so the board is worth reading. */
export const MAX_AVAILABLE_CONTRACTS = 3

/** Carried contracts at once. Two, so the hold is a choice. */
export const MAX_ACTIVE_CONTRACTS = 2

/**
 * Contract loads, as a share of the cargo hold.
 *
 * Capped well below a full hold on purpose: a load that exactly fills the ship
 * leaves nothing for the rest of the business, and the early game has a 12-unit
 * hold that a 25-75% band already makes meaningful.
 */
export const CONTRACT_QTY_MIN_SHARE = 0.25
export const CONTRACT_QTY_MAX_SHARE = 0.75

/**
 * Slack on top of the flight itself, in days.
 *
 * The deadline is never a puzzle to time: it is the trip plus a couple of days
 * to buy the load, find a berth or recover from a mistimed jump. Two at the
 * tight end is enough that a same-day purchase and jump clears it; five at the
 * slack end is a contract that can wait for a cheap market first.
 */
export const CONTRACT_DEADLINE_MIN_BUFFER = 2
export const CONTRACT_DEADLINE_MAX_BUFFER = 5

/**
 * What the client pays over the value of the goods plus the fuel to move them.
 *
 * Bounded, and applied once when the contract is generated. A percentage that
 * scaled with distance or cargo would turn long hauls into a strictly better
 * rate of return and the shorter contracts would stop being worth taking.
 */
export const CONTRACT_PREMIUM_MIN = 0.2
export const CONTRACT_PREMIUM_MAX = 0.4

/**
 * The credits a generated load is sized against, floored at this.
 *
 * A pilot reduced to nothing would otherwise only ever be offered 1-unit jobs,
 * which is the opposite of the recovery the board is there to offer. The floor
 * is deliberately below the starting balance: an early offer has to be
 * affordable, not merely possible.
 */
export const CONTRACT_MIN_OFFER_CREDITS = 200

/** Two per commodity, so the same load can be offered as different work. */
export const CONTRACT_TITLES: Record<CommodityId, [string, string]> = {
  food: ['Food Relief', 'Ration Shipment'],
  water: ['Water Shipment', 'Tanker Charter'],
  fuel: ['Fuel Resupply', 'Power Contract'],
  metals: ['Metals Order', 'Foundry Contract'],
  electronics: ['Components Order', 'Tech Transfer'],
  medicine: ['Medical Relief', 'Medical Shipment'],
  luxury: ['Luxury Consignment', 'Prestige Shipment'],
  crystals: ['Crystal Order', 'Research Contract'],
}

export const CONTRACT_CLIENTS: [string, string, string, string] = [
  'Sector Relief Office',
  'Colonial Supply Guild',
  'Frontier Aid Network',
  'Megacorp Logistics',
]

/** The client's complaint. One clause, never the reason - the board says why. */
export const CONTRACT_FLAVOUR: Record<CommodityId, string> = {
  food: 'rations are down to a day and a half',
  water: 'the reserve tanks are down to a trickle',
  fuel: 'the generators are running on fumes',
  metals: 'the fabricators have nothing left to cut',
  electronics: 'the tech stacks are dark for want of parts',
  medicine: 'the clinics have run their shelves bare',
  luxury: 'the season opens in days and nothing has been ordered',
  crystals: 'the assay needs its samples now',
}

/**
 * Travel encounters: the small things that happen to a ship on the way
 * somewhere, and the one choice the player gets.
 *
 * An encounter is deliberately the lightest system in the game - no combat, no
 * damage, no equipment, no reputation. It costs the player a decision and maybe
 * a few dozen credits, and it exists so that a jump is occasionally something
 * other than arithmetic. What makes it interesting is the delay: a choice that
 * costs a day is charged through the ordinary `advanceDay`, so it quietly moves
 * markets, market events and contract deadlines with everything else, and a
 * contract can be missed by an encounter rather than by a bad trade.
 *
 * These are the *definitions* - pure data, no functions - and they live here
 * beside the market event definitions for the same reason. A journey's actual
 * encounter is a `PendingEncounter` holding ids and dates, and everything a
 * player reads or pays is derived from these by `encounterService`.
 */

/** One of the decisions an encounter offers. */
export interface EncounterChoiceDefinition {
  id: string
  label: string
  /** One short line: what the choice commits to, or what it risks. */
  detail: string
  /**
   * Credits the choice *certainly* costs, in base units, before progression
   * scaling. The drawn figure is shown on the button, so a payment is never a
   * surprise; anything uncertain is described in `risk` instead of hidden.
   */
  cost: [number, number]
  /** What else the choice might cost, phrased as uncertainty. Omitted when certain. */
  risk?: string
  /** Past-tense phrase for the flight log: "assisted a damaged freighter". */
  log: string
}

export interface TravelEncounterDefinition {
  type: TravelEncounterType
  name: string
  icon: string
  description: string
  choices: EncounterChoiceDefinition[]
}

export const TRAVEL_ENCOUNTERS: TravelEncounterDefinition[] = [
  {
    type: 'distress-signal',
    name: 'Distress Signal',
    icon: '🆘',
    description: 'A damaged freighter is broadcasting nearby, running on fumes.',
    choices: [
      {
        id: 'assist',
        label: 'Assist',
        detail: 'Cover their emergency repairs.',
        cost: [50, 150],
        risk: 'They may pay you back for it.',
        log: 'assisted a damaged freighter',
      },
      {
        id: 'ignore',
        label: 'Ignore',
        detail: 'Keep to your course.',
        cost: [0, 0],
        log: 'ignored a distress call',
      },
    ],
  },
  {
    type: 'derelict-pod',
    name: 'Derelict Cargo Pod',
    icon: '📦',
    description: 'Sensors pick up an abandoned pod tumbling in the drift.',
    choices: [
      {
        id: 'salvage',
        label: 'Salvage',
        detail: 'Haul it aboard if the hold has room.',
        cost: [0, 0],
        log: 'salvaged an abandoned cargo pod',
      },
      {
        id: 'leave',
        label: 'Leave it',
        detail: 'Let it keep drifting.',
        cost: [0, 0],
        log: 'left a cargo pod behind',
      },
    ],
  },
  {
    type: 'pirate-demand',
    name: 'Pirate Demand',
    icon: '🏴‍☠️',
    description: 'A small raider vessel drops astern and wants a toll for the passage.',
    choices: [
      {
        id: 'pay',
        label: 'Pay the toll',
        detail: 'Pay up and go on your way.',
        cost: [100, 140],
        log: 'paid a raider toll',
      },
      {
        id: 'run',
        label: 'Run',
        detail: 'Burn hard for open space.',
        cost: [0, 0],
        risk: 'You might shake them off - or lose a little and lose a day.',
        log: 'ran from a raider',
      },
    ],
  },
  {
    type: 'engine-trouble',
    name: 'Engine Trouble',
    icon: '⚙️',
    description: 'The warp coils are overheating and the drive has gone unstable.',
    choices: [
      {
        id: 'repair',
        label: 'Repair properly',
        detail: 'A yard tug works on the coils while you hold station.',
        cost: [40, 120],
        log: 'repaired the warp drive',
      },
      {
        id: 'patch',
        label: 'Patch it',
        detail: 'Keep flying on a patched drive.',
        cost: [0, 0],
        risk: 'You may lose a day to it.',
        log: 'patched over engine trouble',
      },
    ],
  },
  {
    type: 'space-debris',
    name: 'Space Debris',
    icon: '🛰️',
    description: 'A debris field is drifting across the lane ahead.',
    choices: [
      {
        id: 'detour',
        label: 'Detour',
        detail: 'Go around it.',
        cost: [0, 0],
        risk: 'A day longer in transit.',
        log: 'detoured around a debris field',
      },
      {
        id: 'push',
        label: 'Push through',
        detail: 'Straight over, watching the plating.',
        cost: [0, 0],
        risk: 'Something may scrape the hull.',
        log: 'pushed through a debris field',
      },
    ],
  },
  {
    type: 'merchant-convoy',
    name: 'Merchant Convoy',
    icon: '🚚',
    description: 'A convoy hauls alongside, selling off a pallet before they move on.',
    choices: [
      {
        id: 'buy',
        label: 'Buy the pallet',
        detail: 'Take a few units off their hands at a discount.',
        cost: [0, 0],
        risk: 'Uses hold space.',
        log: 'bought from a passing convoy',
      },
      {
        id: 'decline',
        label: 'Decline',
        detail: 'Wish them a good run.',
        cost: [0, 0],
        log: 'declined a convoy sale',
      },
    ],
  },
  {
    type: 'nav-anomaly',
    name: 'Navigation Anomaly',
    icon: '🧭',
    description: 'Gravitational readings ahead do not match anything on the charts.',
    choices: [
      {
        id: 'investigate',
        label: 'Investigate',
        detail: 'Have the sensors look closer.',
        cost: [0, 0],
        risk: 'Possible credits, possible lost day.',
        log: 'investigated a navigation anomaly',
      },
      {
        id: 'ignore',
        label: 'Ignore',
        detail: 'The suite is probably wrong.',
        cost: [0, 0],
        log: 'ignored odd readings',
      },
    ],
  },
  {
    type: 'customs-check',
    name: 'Customs Inspection',
    icon: '🛃',
    description: 'A patrol cutter hails you and asks for your manifest.',
    choices: [
      {
        id: 'comply',
        label: 'Comply',
        detail: 'Answer the hail and show the manifest.',
        cost: [0, 0],
        risk: 'Usually free. They may charge a small fee.',
        log: 'complied with a customs inspection',
      },
      {
        id: 'expedite',
        label: 'Expedite',
        detail: 'Buy the inspector off the record.',
        cost: [30, 70],
        log: 'paid to speed through customs',
      },
    ],
  },
  {
    type: 'science-probe',
    name: 'Scientific Probe',
    icon: '🔭',
    description: 'An autonomous probe asks for a telemetry packet from your flight data.',
    choices: [
      {
        id: 'transmit',
        label: 'Transmit data',
        detail: 'Hand over the flight data.',
        cost: [0, 0],
        log: 'answered a science probe',
      },
      {
        id: 'ignore',
        label: 'Ignore',
        detail: 'Your data is your own.',
        cost: [0, 0],
        log: 'ignored a science probe',
      },
    ],
  },
  {
    type: 'fuel-cache',
    name: 'Fuel Cache',
    icon: '⛽',
    description: 'A dead navigation beacon marks an abandoned fuel cache nobody has claimed.',
    choices: [
      {
        id: 'salvage',
        label: 'Salvage',
        detail: 'Strip the tanks and claim the salvage bond.',
        cost: [0, 0],
        log: 'claimed an abandoned fuel cache',
      },
      {
        id: 'ignore',
        label: 'Ignore',
        detail: 'Leave the beacon as it is.',
        cost: [0, 0],
        log: 'left a fuel cache alone',
      },
    ],
  },
]

export const TRAVEL_ENCOUNTER_MAP: Record<string, TravelEncounterDefinition> =
  TRAVEL_ENCOUNTERS.reduce(
    (acc, e) => {
      acc[e.type] = e
      return acc
    },
    {} as Record<string, TravelEncounterDefinition>,
  )

/**
 * Chance a jump runs into something, in percent, for the shortest hop.
 *
 * Deliberately occasional: three or four journeys in ten are quiet, so an
 * encounter stays a moment rather than the texture of every jump.
 */
export const ENCOUNTER_CHANCE_BASE_PERCENT = 20

/**
 * Extra chance for every further day of flight, so a long haul is a little more
 * eventful than a hop next door - and capped below, because a game about
 * arriving on time should not gamble the schedule.
 */
export const ENCOUNTER_CHANCE_PER_DAY_PERCENT = 2
export const ENCOUNTER_CHANCE_MAX_PERCENT = 30

/**
 * What an encounter is worth, in base credits, before progression scaling.
 *
 * Sized against a 1200 cr starting balance and a 100,000 cr goal: an encounter
 * moves tens of credits, never hundreds, so it is flavour with a price on it
 * rather than a second economy. The rare payout is the exception and stays
 * inside a single profitable cargo run.
 */
export const ENCOUNTER_REWARD_MIN = 30
export const ENCOUNTER_REWARD_MAX = 250
export const ENCOUNTER_RARE_REWARD_MAX = 400
/** Chance, out of 100, that a generous encounter pays the rare figure. */
export const ENCOUNTER_RARE_CHANCE_PERCENT = 12

/** Days a single bad choice costs. One, never more: the delay is a decision, not a punishment. */
export const ENCOUNTER_DELAY_DAYS = 1

/** Units of salvage or of a convoy pallet. Small enough to fit any hold. */
export const ENCOUNTER_CARGO_MIN_UNITS = 1
export const ENCOUNTER_CARGO_MAX_UNITS = 4

/** What a passing trader knocks off, as a share of the listed price. */
export const ENCOUNTER_CONVOY_DISCOUNT_MIN = 0.6
export const ENCOUNTER_CONVOY_DISCOUNT_MAX = 0.8

/**
 * How far the figures above stretch with the player's progress.
 *
 * Credits spent on upgrades are the only progression signal a save carries, and
 * they are also a proxy for scale: an early encounter paying 30-250 cr matters
 * against 1200 cr, and the same 250 cr is noise against a late-game hold. So
 * every credit figure is multiplied by at most this, doubling at most once, and
 * nowhere near fast enough to make encounters a strategy.
 */
export const ENCOUNTER_SCALE_UPGRADE_BUDGET = 25_000
export const ENCOUNTER_SCALE_MAX = 2

/**
 * The multiplier a state's encounters are scaled by: 1 for a new pilot, at most
 * `ENCOUNTER_SCALE_MAX` for a fully upgraded ship.
 */
export function encounterScale(upgradesInvested: number): number {
  if (!Number.isFinite(upgradesInvested) || upgradesInvested <= 0) return 1
  return 1 + Math.min(ENCOUNTER_SCALE_MAX - 1, upgradesInvested / ENCOUNTER_SCALE_UPGRADE_BUDGET)
}