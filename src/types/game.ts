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
  /**
   * Delivery contracts paid out. A contract reward is *not* trading profit: the
   * goods still went through the market and were still bought, so booking the
   * fee here as well would count the same money twice.
   */
  contractRevenue: number
  contractsCompleted: number
  contractsFailed: number
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

/**
 * A contract is "deliver N of commodity C to planet D by day X for a fee".
 *
 * A contract is a job, not a market: it never creates goods, never moves a
 * price, and never pays out on its own. The player buys the load at the origin
 * like any other trade, flies the route, and hands it over with an explicit
 * action - arriving at the destination does not complete anything.
 *
 * `title`, the client and the flavour text are all derived from `id` and
 * `commodityId` (`describeContract`), so they are deliberately not stored: they
 * are decoration on a record the player has to look at.
 */
export interface Contract {
  /**
   * `${originPlanetId}#${offeredDay}#${slot}` - derived from the inputs that
   * generated it, never random and never a timestamp, so the same save
   * regenerates the same board and a reloaded contract keeps its identity.
   */
  id: string
  commodityId: CommodityId
  quantity: number
  /**
   * Where the work was offered. Recorded because the deal is struck here - but
   * payment is made wherever the goods are handed over, so the player never has
   * to come back.
   */
  originPlanetId: string
  destinationPlanetId: string
  offeredDay: number
  /** Deliverable on this day. It fails on the day after. */
  deadlineDay: number
  /**
   * Fixed the moment the contract is generated, for the whole of its life. A
   * market event that makes the goods cheap afterwards makes the run cheaper -
   * it never re-prices a signed deal.
   */
  reward: number
  status: ContractStatus
}

/**
 * `completed` and `failed` are deliberately absent: a contract leaves the save
 * the moment it is delivered or expires, and the stats plus the flight log are
 * the record. Hundreds of dead contract objects would grow every load to say
 * what two counters already say.
 */
export type ContractStatus = 'available' | 'accepted'

/** The kind of encounter, drawn from `TRAVEL_ENCOUNTERS`. */
export type TravelEncounterType = string

/**
 * A journey interrupted by something, waiting to be played out.
 *
 * This is the *instance*: it names what happened, which flight it happened on
 * and how much of that flight is already behind the player. Everything else -
 * the title, the description, the choices, what a choice costs and what it
 * pays - is derived from the encounter's definition and this record's own id by
 * `encounterService`, so the save carries no decoration and no functions, and a
 * reloaded encounter reads and resolves exactly as it did before.
 *
 * `id` is derived from (origin, destination, departure day, journey count)
 * rather than generated, so the same flight always produces the same encounter:
 * a player who reloads mid-jump gets the encounter they were already offered,
 * not a fresh roll of the same door.
 *
 * The ship is *between* planets while one of these is pending. `planetId` is
 * still the origin - the player has not arrived - and the rest of the jump is
 * flown by `resolveEncounter` once the encounter is settled.
 */
export interface PendingEncounter {
  id: string
  type: TravelEncounterType
  originPlanetId: string
  destinationPlanetId: string
  /** The day the ship left the origin. Seeds the whole flight. */
  departureDay: number
  /** The day the encounter interrupted the jump. */
  triggerDay: number
  /** Days the jump takes in total, delay not included. */
  journeyDays: number
  /** Credits charged as fuel when the ship left. */
  fuelCost: number
}

/**
 * What one encounter choice actually did.
 *
 * A value, not a mutation: the encounter computes this and `applyEncounterResult`
 * performs every write, so no encounter can decide for itself how to touch
 * credits, cargo or the clock.
 */
export interface EncounterResult {
  /** Credits gained (positive) or charged (negative). */
  creditsDelta?: number
  /** Extra days beyond the journey's own. Advanced through `advanceDay`. */
  daysDelta?: number
  cargoDelta?: Partial<Record<CommodityId, number>>
  /**
   * Per-unit basis for the cargo awarded, alongside `cargoDelta`. Missing means
   * free salvage, which is booked at 0 - see `applyEncounterResult`.
   */
  cargoBasis?: Partial<Record<CommodityId, number>>
  /** Units bought from an encounter trader, counted as goods bought. */
  unitsBought?: number
  /** One sentence for the log and the toast. Never more. */
  message: string
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
  /**
   * Every contract still live: those on offer at the current planet and those
   * the player has accepted. Both are bounded (`MAX_AVAILABLE_CONTRACTS`,
   * `MAX_ACTIVE_CONTRACTS`) and both are refilled as days advance, so this is
   * a handful of objects rather than a history.
   */
  contracts: Contract[]
  /**
   * An encounter waiting to be resolved, or null. Non-null means the ship is
   * mid-jump: no second journey can start, and no other action can be taken,
   * until this is settled.
   */
  pendingEncounter: PendingEncounter | null
  stats: Stats
  log: LogEntry[]
}