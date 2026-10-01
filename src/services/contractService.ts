import type { Contract, GameState } from '../types/game'
import {
  COMMODITIES,
  COMMODITY_MAP,
  CONTRACT_CLIENTS,
  CONTRACT_DEADLINE_MAX_BUFFER,
  CONTRACT_DEADLINE_MIN_BUFFER,
  CONTRACT_FLAVOUR,
  CONTRACT_MIN_OFFER_CREDITS,
  CONTRACT_PREMIUM_MAX,
  CONTRACT_PREMIUM_MIN,
  CONTRACT_QTY_MAX_SHARE,
  CONTRACT_QTY_MIN_SHARE,
  CONTRACT_TITLES,
  MAX_ACTIVE_CONTRACTS,
  MAX_AVAILABLE_CONTRACTS,
  PLANET_MAP,
  PLANETS,
  cargoCapacityAtLevel,
  distanceBetween,
  fuelCostBetween,
  withLog,
} from '../data/gameData'
import { hashString } from '../utils/hash'

/**
 * Delivery contracts: "carry N of commodity C to planet D by day X for a fee".
 *
 * Four rules hold the whole system together:
 *
 *  1. A contract never creates goods. The load is bought from the same market
 *     as any other trade, so accepting one moves no cargo, no credits and no
 *     stock - and delivering one moves cargo out of the hold, never into a
 *     market. The client takes the goods; nobody sells them.
 *  2. Delivery is explicit. Arriving at the destination completes nothing,
 *     because the player may well be holding someone else's medicine and would
 *     not know that it was wanted until told.
 *  3. Generation is a pure function of the state that generated it - day, origin
 *     planet, slot - seeded through the game's one hash. No `Math.random`, no
 *     timestamps, so the same save replays to the same board.
 *  4. The reward is fixed when the contract is drawn and never re-priced.
 *     Market events change what the goods cost to acquire, which is the
 *     player's risk to manage, not the client's obligation.
 *
 * Everything is derived rather than stored wherever the game already knows the
 * answer: the flight time of a contract is `distanceBetween(origin, destination)`
 * and the trip it names is the same one `travelService` flies.
 */

/** Stable id for one generated contract. Derived from the inputs that made it. */
export function contractId(offeredDay: number, originPlanetId: string, slot: number): string {
  return `${originPlanetId}#${offeredDay}#${slot}`
}

/** A whole number drawn from `[min, max]`, seeded by a stable key. */
function draw(key: string, min: number, max: number): number {
  return min + (hashString(key) % (max - min + 1))
}

/** A fraction in `[0, 1)` drawn from a stable key. */
function fraction(key: string): number {
  return (hashString(key) % 10000) / 10000
}

export interface ContractFlavour {
  title: string
  client: string
  /** Why the client wants it, as one clause. */
  description: string
}

/**
 * The decoration on a contract, derived from its own id rather than stored.
 *
 * All three come out of the same stable id, so a reloaded contract reads exactly
 * as it did before - and the save carries three fewer strings per contract.
 */
export function describeContract(contract: Contract): ContractFlavour {
  const titles = CONTRACT_TITLES[contract.commodityId] ?? [contract.commodityId]
  return {
    title: titles[hashString(`contract:title:${contract.id}`) % titles.length],
    client: CONTRACT_CLIENTS[hashString(`contract:client:${contract.id}`) % CONTRACT_CLIENTS.length],
    description: CONTRACT_FLAVOUR[contract.commodityId],
  }
}

/** The flight a contract names: the same distance and fuel the player would pay. */
export function contractRoute(
  contract: Contract,
  engineLevel: number,
): { days: number; fuelCost: number } {
  const from = PLANET_MAP[contract.originPlanetId]
  const to = PLANET_MAP[contract.destinationPlanetId]
  if (!from || !to) return { days: 0, fuelCost: 0 }
  return {
    days: distanceBetween(from, to),
    fuelCost: fuelCostBetween(contract.originPlanetId, contract.destinationPlanetId, engineLevel),
  }
}

/** The flight from wherever the ship is now to where a contract wants it. */
export function routeFromHere(
  state: GameState,
  contract: Contract,
): { days: number; fuelCost: number } {
  const from = PLANET_MAP[state.planetId]
  const to = PLANET_MAP[contract.destinationPlanetId]
  if (!from || !to) return { days: 0, fuelCost: 0 }
  return {
    days: distanceBetween(from, to),
    fuelCost: fuelCostBetween(state.planetId, contract.destinationPlanetId, state.ship.engineLevel),
  }
}

/** Contracts the player has taken on and not yet handed over. */
export function activeContracts(state: GameState): Contract[] {
  return state.contracts
    .filter((c) => c.status === 'accepted')
    .sort((a, b) => a.deadlineDay - b.deadlineDay)
}

/**
 * Contracts on offer right here.
 *
 * Scoped to the planet that offered them: contracts are struck locally, so a
 * board left behind in another system is not a standing offer. Filtered on read
 * as well as on generation so a save, a hand-edited one or a state mid-jump can
 * never show a job that cannot be taken where the player is.
 */
export function availableContracts(state: GameState): Contract[] {
  return state.contracts
    .filter(
      (c) =>
        c.status === 'available' &&
        c.originPlanetId === state.planetId &&
        c.deadlineDay >= state.day,
    )
    .sort((a, b) => a.deadlineDay - b.deadlineDay || b.reward - a.reward)
}

/** How many of the player's active contracts want a load delivered to `planetId`. */
export function contractDests(state: GameState): Map<string, number> {
  const counts = new Map<string, number>()
  for (const contract of activeContracts(state)) {
    counts.set(contract.destinationPlanetId, (counts.get(contract.destinationPlanetId) ?? 0) + 1)
  }
  return counts
}

/**
 * What the goods would cost to buy here, today, at the listed price.
 *
 * The listed price rather than a walked quote: this is the *client's* estimate
 * of their own order when they wrote the contract, not a quote to the player.
 * It ignores the impact of draining this much stock in one go, which makes the
 * fee a shade generous on a full load - the safe direction to be approximate
 * in, and one that keeps generation a pure function of the day rather than a
 * second order book.
 */
function estimatedPurchaseCost(state: GameState, contract: Omit<Contract, 'id'>): number {
  const unit =
    state.markets[contract.originPlanetId]?.[contract.commodityId]?.price ??
    COMMODITY_MAP[contract.commodityId].basePrice
  return unit * contract.quantity
}

/**
 * Generates one contract for the origin planet, or null if the origin is not a
 * real place in the galaxy.
 *
 * Everything drawn here is a function of `(day, originPlanetId, slot)` and the
 * state it is generated against, so re-running it on the same inputs returns
 * the same contract. `slot` is the board position, which is also what makes the
 * id unique: two slots on the same day at the same planet are different jobs.
 */
export function generateContract(
  state: GameState,
  originPlanetId: string,
  day: number,
  slot: number,
): Contract | null {
  const origin = PLANET_MAP[originPlanetId]
  if (!origin) return null

  const key = `${day}:${originPlanetId}:${slot}`
  const id = contractId(day, originPlanetId, slot)

  // The load is one of the eight goods. Nothing excludes a commodity here: a
  // fuel run is a real job, and restricting the pool would only make the board
  // predictable.
  const commodity = COMMODITIES[hashString(`contract:commodity:${key}`) % COMMODITIES.length]

  // The destination is any other planet in the galaxy. `PLANETS` is the whole
  // galaxy, so a drawn destination always exists, always has a market, and is
  // always flyable - the sector has no locked routes.
  const others = PLANETS.filter((p) => p.id !== originPlanetId)
  if (others.length === 0) return null
  const destination = others[hashString(`contract:destination:${key}`) % others.length]

  // The deadline is the flight plus a fixed buffer, so it is always achievable
  // on the engine the player has now - and stays the same one they accepted it
  // with if they upgrade later. No second clock, no rescheduling.
  const flightDays = distanceBetween(origin, destination)
  const buffer = draw(`contract:buffer:${key}`, CONTRACT_DEADLINE_MIN_BUFFER, CONTRACT_DEADLINE_MAX_BUFFER)

  // The load is a slice of the hold: never the whole thing, and never more than
  // the origin market can supply or the player could pay for today.
  const capacity = cargoCapacityAtLevel(state.ship.cargoLevel)
  const share =
    CONTRACT_QTY_MIN_SHARE +
    fraction(`contract:share:${key}`) * (CONTRACT_QTY_MAX_SHARE - CONTRACT_QTY_MIN_SHARE)
  const minByHold = Math.max(1, Math.round(capacity * CONTRACT_QTY_MIN_SHARE))
  const maxByHold = Math.max(minByHold, Math.floor(capacity * CONTRACT_QTY_MAX_SHARE))
  const byHold = Math.min(maxByHold, Math.max(minByHold, Math.round(capacity * share)))
  const stock = state.markets[originPlanetId]?.[commodity.id]?.stock ?? byHold
  const unitPrice =
    state.markets[originPlanetId]?.[commodity.id]?.price ?? commodity.basePrice
  const budget = Math.max(state.credits, CONTRACT_MIN_OFFER_CREDITS)
  const byCredits = Math.floor(budget / Math.max(1, unitPrice))
  const quantity = Math.max(1, Math.min(byHold, stock, byCredits))

  const draft = {
    commodityId: commodity.id,
    quantity,
    originPlanetId,
    destinationPlanetId: destination.id,
    offeredDay: day,
    deadlineDay: day + flightDays + buffer,
    reward: 0,
    status: 'available' as const,
  }

  // The fee covers what the goods cost the client, what it costs the player to
  // fly them, and a premium for the trouble - fixed here and never revisited.
  // It rises with the load and with the distance for free, because both are
  // already in the two terms underneath it.
  const premium =
    CONTRACT_PREMIUM_MIN +
    fraction(`contract:premium:${key}`) * (CONTRACT_PREMIUM_MAX - CONTRACT_PREMIUM_MIN)
  const flightCost = fuelCostBetween(originPlanetId, destination.id, state.ship.engineLevel)
  const reward = Math.max(
    1,
    Math.round((estimatedPurchaseCost(state, draft) + flightCost) * (1 + premium)),
  )

  return { id, ...draft, reward }
}

/**
 * Tops the local board up to `MAX_AVAILABLE_CONTRACTS` offers, and drops the
 * offers that are no longer standing.
 *
 * One place decides what stays on the board, so every path that changes the day
 * or the location ends up with the same board. Offers are struck at a planet, so
 * a board left behind is not a standing offer anywhere else; offers that ran out
 * of time are gone. Both are dropped here rather than left for a reader to
 * filter, which is what stopped a stale board from ever refilling.
 *
 * Called whenever an offer leaves the board - taken, expired, or the player
 * moved on - and never from a render, so the board only ever changes because the
 * game did something. Slots already in use are stepped over, which is what stops
 * a regenerated offer from colliding with a contract the player has already
 * accepted.
 */
function refreshBoard(state: GameState): GameState {
  const standing = state.contracts.filter(
    (c) =>
      c.status !== 'available' ||
      (c.originPlanetId === state.planetId && c.deadlineDay >= state.day),
  )
  const taken = new Set(standing.map((c) => c.id))
  const offered = standing.filter(
    (c) => c.status === 'available' && c.originPlanetId === state.planetId,
  ).length
  const added: Contract[] = []

  // A day's board cannot fill more slots than the number of contracts that can
  // coexist, so the probe is bounded by that rather than left open.
  for (
    let slot = 0;
    offered + added.length < MAX_AVAILABLE_CONTRACTS &&
    slot < MAX_ACTIVE_CONTRACTS + MAX_AVAILABLE_CONTRACTS;
    slot++
  ) {
    const id = contractId(state.day, state.planetId, slot)
    if (taken.has(id)) continue
    const contract = generateContract(state, state.planetId, state.day, slot)
    if (!contract) break
    taken.add(contract.id)
    added.push(contract)
  }

  if (added.length === 0 && standing.length === state.contracts.length) return state
  return { ...state, contracts: [...standing, ...added] }
}

/**
 * Settles the contract book against today's date: anything past its deadline
 * fails, and the board at the current planet is brought up to date.
 *
 * Called from `waitDay` and `travel`, so deadlines move on the same clock as
 * everything else and a jump that spans several days cannot log the same
 * failure twice - the contract is gone the first time it is processed, and a
 * second pass has nothing left to fail.
 */
export function settleContracts(state: GameState): GameState {
  let next = state
  for (const contract of state.contracts) {
    if (contract.status !== 'accepted') continue
    if (state.day <= contract.deadlineDay) continue
    // No penalty. The cargo is still in the hold and the credits are still in
    // the account: a missed delivery costs the fee, not the run.
    next = withLog(
      { ...next, contracts: next.contracts.filter((c) => c.id !== contract.id) },
      '❌',
      `${describeContract(contract).title} failed: the ${contract.quantity}× ${
        COMMODITY_MAP[contract.commodityId].name
      } did not reach ${planetName(contract.destinationPlanetId)} by Day ${contract.deadlineDay}.`,
    )
    next = {
      ...next,
      stats: { ...next.stats, contractsFailed: next.stats.contractsFailed + 1 },
    }
  }
  return refreshBoard(next)
}

/**
 * Takes a contract on. Moves no cargo, no credits and no stock.
 *
 * The load still has to be bought, on the origin market, at whatever it costs
 * that day - which is the whole point of the arrangement being a contract and
 * not a delivery.
 */
export function acceptContract(
  state: GameState,
  contractIdToAccept: string,
): { state: GameState; error?: string } {
  const contract = state.contracts.find((c) => c.id === contractIdToAccept)
  if (!contract) return { state, error: 'That contract is no longer on the board.' }
  if (contract.status !== 'available') return { state, error: 'That contract is already taken.' }
  if (contract.originPlanetId !== state.planetId) {
    return { state, error: 'That offer is not available at this planet.' }
  }
  if (contract.deadlineDay < state.day) return { state, error: 'That offer has expired.' }
  if (activeContracts(state).length >= MAX_ACTIVE_CONTRACTS) {
    return { state, error: `You can carry at most ${MAX_ACTIVE_CONTRACTS} contracts at once.` }
  }

  return {
    state: refreshBoard({
      ...state,
      contracts: state.contracts.map((c) =>
        c.id === contract.id ? { ...c, status: 'accepted' as const } : c,
      ),
    }),
  }
}

/**
 * Hands a contract's load over at its destination.
 *
 * The cargo leaves the hold and the fee is credited. Nothing else happens: the
 * goods go to the client, not onto the local market, so no stock is restocked,
 * no price is knocked down and no trading profit is booked. `tradingProfit`
 * stays untouched and `contractRevenue` carries the fee - the two are different
 * facts about the run, and the cost of the goods has already been spent.
 */
export function deliverContract(
  state: GameState,
  contractIdToDeliver: string,
): { state: GameState; error?: string } {
  const contract = state.contracts.find((c) => c.id === contractIdToDeliver)
  if (!contract) return { state, error: 'That contract is no longer active.' }
  // The status check is what stops a completed or failed contract being claimed
  // a second time: both are removed from the save the moment they resolve, and
  // anything still here in another state is not owed anything.
  if (contract.status !== 'accepted') return { state, error: 'That contract is not active.' }
  if (!Number.isInteger(contract.quantity) || contract.quantity <= 0) {
    return { state, error: 'That contract is malformed.' }
  }
  if (!Number.isFinite(contract.reward) || contract.reward <= 0) {
    return { state, error: 'That contract is malformed.' }
  }
  if (state.planetId !== contract.destinationPlanetId) {
    return { state, error: `Deliver at ${planetName(contract.destinationPlanetId)}.` }
  }
  // The deadline day itself is still good: a contract running to Day 15 can be
  // handed over on Day 15. It fails on Day 16.
  if (state.day > contract.deadlineDay) return { state, error: 'That deadline has passed.' }

  const held = state.cargo[contract.commodityId] ?? 0
  if (held < contract.quantity) {
    return {
      state,
      error: `You need ${contract.quantity - held} more ${COMMODITY_MAP[contract.commodityId]?.name ?? contract.commodityId}.`,
    }
  }

  const remaining = held - contract.quantity
  // The basis is per unit, so taking part of a stack leaves the rest on exactly
  // the same basis and nothing to recalculate. Only an emptied line is dropped.
  const costBasis = { ...state.costBasis }
  if (remaining === 0) delete costBasis[contract.commodityId]

  return {
    state: refreshBoard({
      ...state,
      credits: state.credits + contract.reward,
      cargo: { ...state.cargo, [contract.commodityId]: remaining },
      costBasis,
      contracts: state.contracts.filter((c) => c.id !== contract.id),
      stats: {
        ...state.stats,
        contractRevenue: state.stats.contractRevenue + contract.reward,
        contractsCompleted: state.stats.contractsCompleted + 1,
      },
    }),
  }
}

function planetName(planetId: string): string {
  return PLANET_MAP[planetId]?.name ?? planetId
}

/** "deliver 8 Medicine to Drax-7 by Day 19 for 850 cr", for the log and the toast. */
export function describeAcceptance(contract: Contract): string {
  return `deliver ${contract.quantity} ${COMMODITY_MAP[contract.commodityId]?.name ?? contract.commodityId} to ${planetName(
    contract.destinationPlanetId,
  )} by Day ${contract.deadlineDay} for ${contract.reward} cr`
}
