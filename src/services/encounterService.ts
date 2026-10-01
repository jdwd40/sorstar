import type {
  CommodityId,
  EncounterResult,
  GameState,
  PendingEncounter,
} from '../types/game'
import type { TravelEncounterDefinition } from '../data/gameData'
import {
  COMMODITIES,
  COMMODITY_MAP,
  ENCOUNTER_CARGO_MAX_UNITS,
  ENCOUNTER_CARGO_MIN_UNITS,
  ENCOUNTER_CHANCE_BASE_PERCENT,
  ENCOUNTER_CHANCE_MAX_PERCENT,
  ENCOUNTER_CHANCE_PER_DAY_PERCENT,
  ENCOUNTER_CONVOY_DISCOUNT_MAX,
  ENCOUNTER_CONVOY_DISCOUNT_MIN,
  ENCOUNTER_DELAY_DAYS,
  ENCOUNTER_RARE_CHANCE_PERCENT,
  ENCOUNTER_RARE_REWARD_MAX,
  ENCOUNTER_REWARD_MAX,
  ENCOUNTER_REWARD_MIN,
  PLANET_MAP,
  TRAVEL_ENCOUNTERS,
  TRAVEL_ENCOUNTER_MAP,
  encounterScale,
} from '../data/gameData'
import { advanceDay, cargoBasisAt, cargoFree } from './marketService'
import { hashString } from '../utils/hash'

/**
 * Travel encounters: one interruption per journey at most, one choice, one
 * outcome, and then the rest of the flight.
 *
 * The rules that hold it together:
 *
 *  1. Everything drawn is a function of the flight's own stable inputs -
 *     origin, destination, departure day, and the player's journey count -
 *     seeded through the game's one hash. No `Math.random` anywhere, so
 *     reloading a save mid-jump returns the encounter already on screen and
 *     resolves it exactly as before. There is nothing to reroll.
 *  2. At most one encounter per journey. The roll happens once, when the ship
 *     leaves, and resolving it never draws another.
 *  3. Definitions are data (`TRAVEL_ENCOUNTERS`); instances are ids and dates
 *     (`PendingEncounter`). Everything the player reads or pays - title,
 *     description, choices, costs - is derived, so a save holds no strings to
 *     drift out of step with the code and no functions at all.
 *  4. Results are values, not mutations. An encounter computes an
 *     `EncounterResult`; `applyEncounterResult` performs every write, so no
 *     encounter can invent its own way of touching credits, cargo or the clock.
 *  5. A delay is charged through the ordinary `advanceDay`, so it moves markets,
 *     market events and contract deadlines the same way a waited day does. A
 *     contract can be missed because of something that happened in transit, and
 *     that is the point.
 *
 * The bounds are in `gameData`. Nothing here creates a market event, books
 * trading profit, or restocks a market: salvaged cargo enters the hold and
 * nowhere else.
 */

/** A whole number drawn from `[min, max]`, seeded by a stable key. */
function draw(key: string, min: number, max: number): number {
  if (max <= min) return min
  return min + (hashString(key) % (max - min + 1))
}

/** A percentage roll in `[0, 100)`, seeded by a stable key. */
function percentRoll(key: string): number {
  return hashString(key) % 100
}

/**
 * The seed for one journey: where it starts, where it ends, which day it leaves
 * and how many jumps the player has already flown.
 *
 * The journey count is what makes two identical hops on the same day different
 * encounters. It is deliberately read *before* this trip is counted, so the seed
 * of the first jump of a game is the same whatever order the player flies them
 * in after that.
 */
function journeyKey(state: GameState, destinationPlanetId: string): string {
  return `${state.planetId}>${destinationPlanetId}@${state.day}#${state.stats.tripsMade}`
}

/** Stable id for one encounter, derived from the flight that produced it. */
export function encounterId(key: string): string {
  return `enc@${key}`
}

/**
 * Chance, in percent, that a jump of `days` days runs into something.
 *
 * A flat base rate with a small bonus per extra day, capped: roughly one
 * journey in four, a little more often on a long haul, never a certainty. Since
 * the sector map's longest hop is eight days the practical range is 20-30%,
 * which is the whole design target - an encounter should be a thing that
 * happens, not a tax on flying.
 */
export function encounterChancePercent(days: number): number {
  const flight = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0
  return Math.min(
    ENCOUNTER_CHANCE_MAX_PERCENT,
    ENCOUNTER_CHANCE_BASE_PERCENT + flight * ENCOUNTER_CHANCE_PER_DAY_PERCENT,
  )
}

/**
 * The encounter a jump runs into, or null for a quiet one.
 *
 * Two draws from the journey's seed: whether anything is there, and what. A
 * single roll decides *whether*, so most jumps are silent by construction
 * rather than by filtering out encounters that would not apply.
 *
 * `daysFlown` is how much of the flight is already behind the player when it
 * happens - drawn once, at departure - so an encounter can interrupt a jump
 * mid-way instead of always landing on the same day.
 */
export function rollEncounter(
  state: GameState,
  destinationPlanetId: string,
  days: number,
  fuelCost: number,
): PendingEncounter | null {
  const from = PLANET_MAP[state.planetId]
  const to = PLANET_MAP[destinationPlanetId]
  if (!from || !to || from.id === to.id) return null
  if (TRAVEL_ENCOUNTERS.length === 0) return null

  const key = journeyKey(state, destinationPlanetId)
  if (percentRoll(`encounter:roll:${key}`) >= encounterChancePercent(days)) return null

  const def =
    TRAVEL_ENCOUNTERS[hashString(`encounter:pick:${key}`) % TRAVEL_ENCOUNTERS.length]
  // Always leaves at least the last day of the flight to fly, so an encounter
  // never replaces the journey: the player finishes the jump either way.
  const daysFlown = draw(`encounter:split:${key}`, 0, Math.max(0, Math.floor(days) - 1))

  return {
    id: encounterId(key),
    type: def.type,
    originPlanetId: from.id,
    destinationPlanetId: to.id,
    departureDay: state.day,
    triggerDay: state.day + daysFlown,
    journeyDays: Math.max(1, Math.floor(days)),
    fuelCost,
  }
}

/** Days of the journey already flown when the encounter happened. */
export function encounterDaysFlown(pending: PendingEncounter): number {
  return Math.max(0, Math.min(pending.journeyDays, pending.triggerDay - pending.departureDay))
}

/** The definition behind a pending encounter, or null if the build has lost it. */
export function encounterDefinition(pending: PendingEncounter): TravelEncounterDefinition | null {
  return TRAVEL_ENCOUNTER_MAP[pending.type] ?? null
}

/** The title, icon and description, read from the definition rather than the save. */
export function describeEncounter(pending: PendingEncounter): {
  title: string
  icon: string
  description: string
} {
  const def = encounterDefinition(pending)
  return {
    title: def?.name ?? pending.type,
    icon: def?.icon ?? '⚠️',
    description: def?.description ?? 'Something is happening out there.',
  }
}

/** One choice as the player sees it, including what it certainly costs. */
export interface EncounterOption {
  id: string
  label: string
  detail: string
  /** Credits this choice certainly charges. Zero for most. */
  cost: number
  /** What else it might cost, as uncertainty. Empty when the choice is certain. */
  risk?: string
  /**
   * Why the choice cannot be taken, or undefined when it can. An unaffordable
   * payment is refused here rather than clamped later, and a hold with no room
   * cannot be filled - so the player is always left a way through.
   */
  blockedReason?: string
  /** Past-tense phrase for the flight log. */
  log: string
}

/**
 * Credits one choice certainly costs, drawn from the encounter's own id.
 *
 * Derived rather than stored, and read from the same function by the button and
 * by the resolver, so what a choice says it costs is exactly what it charges -
 * on the first visit and after a reload alike.
 */
export function choiceCost(state: GameState, pending: PendingEncounter, choiceId: string): number {
  const def = encounterDefinition(pending)
  const choice = def?.choices.find((c) => c.id === choiceId)
  if (!choice || choice.cost[1] <= 0) return 0
  const base = draw(`encounter:cost:${pending.id}:${choiceId}`, choice.cost[0], choice.cost[1])
  return Math.max(1, Math.round(base * encounterScale(state.stats.upgradesInvested)))
}

/** A reward drawn in the usual band, occasionally the rare larger one. */
function drawReward(
  key: string,
  max = ENCOUNTER_REWARD_MAX,
  rareMax = ENCOUNTER_RARE_REWARD_MAX,
): number {
  const rare = percentRoll(`${key}:rare`) < ENCOUNTER_RARE_CHANCE_PERCENT
  return draw(`${key}:amount`, ENCOUNTER_REWARD_MIN, rare ? rareMax : max)
}

/**
 * A shake-down is only ever what the player can actually lose.
 *
 * Not a clamp on a quoted payment - those are refused outright - but the honest
 * reading of a raider who finds an empty account: they take what is there, and
 * the log says how much that was rather than what would have been.
 */
function shakeDown(credits: number, wanted: number): number {
  return Math.max(0, Math.min(wanted, credits))
}

/**
 * Why a choice is refused, or undefined if it is open.
 *
 * One function, used by the modal to disable a button and by the resolver to
 * reject it, so a choice can never be shown as open and then refused - or worse,
 * charged for something the player could not afford.
 */
export function choiceBlockReason(
  state: GameState,
  pending: PendingEncounter,
  choiceId: string,
): string | undefined {
  const def = encounterDefinition(pending)
  const choice = def?.choices.find((c) => c.id === choiceId)
  if (!def || !choice) return 'That choice is not on offer.'
  const cost = choiceCost(state, pending, choiceId)
  // Never silently clamped: a payment the player cannot make is refused, and
  // the encounter's other choice is still open.
  if (cost > state.credits) {
    return `Needs ${cost} cr - you have ${state.credits} cr.`
  }
  if (choiceFillsHold(pending.type, choiceId) && cargoFree(state) <= 0) return 'The hold is full.'
  return undefined
}

/**
 * Choices that put goods in the hold, and so need somewhere to put them.
 *
 * Keyed by encounter type as well as choice id: `salvage` means a cargo pod in
 * one encounter and a fuel cache in another, and only the first needs space.
 */
function choiceFillsHold(type: string, choiceId: string): boolean {
  return (
    (type === 'derelict-pod' && choiceId === 'salvage') ||
    (type === 'merchant-convoy' && choiceId === 'buy')
  )
}

/** Every choice on offer, in definition order, priced and checked. */
export function encounterOptions(state: GameState, pending: PendingEncounter): EncounterOption[] {
  const def = encounterDefinition(pending)
  if (!def) return []
  return def.choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    detail: choice.detail,
    cost: choiceCost(state, pending, choice.id),
    risk: choice.risk,
    blockedReason: choiceBlockReason(state, pending, choice.id),
    log: choice.log,
  }))
}

/**
 * What one choice actually did, as a value.
 *
 * Every figure is drawn from `pending.id` and the choice id, so the outcome is a
 * pure function of the flight and the decision - the same on a reloaded save as
 * it was the first time. A rolled amount is also checked against what the player
 * can actually pay before it is returned, so the applier never has to clamp.
 */
export function resolveEncounterChoice(
  state: GameState,
  pending: PendingEncounter,
  choiceId: string,
): EncounterResult {
  const key = `${pending.id}:${choiceId}`
  const scale = encounterScale(state.stats.upgradesInvested)
  const paid = choiceCost(state, pending, choiceId)

  switch (pending.type) {
    case 'distress-signal': {
      if (choiceId !== 'assist') return { message: 'You kept your course.' }
      const reward = drawReward(`${key}:assist`)
      return {
        creditsDelta: reward - paid,
        message: `Paid ${paid} cr, received ${reward} cr reward.`,
      }
    }

    case 'derelict-pod': {
      if (choiceId !== 'salvage') return { message: 'You left it drifting.' }
      const free = cargoFree(state)
      if (free <= 0) return { message: 'No room in the hold for it.' }
      const commodity = COMMODITIES[hashString(`${key}:pod`) % COMMODITIES.length]
      const units = Math.min(draw(`${key}:units`, ENCOUNTER_CARGO_MIN_UNITS, ENCOUNTER_CARGO_MAX_UNITS), free)
      return {
        cargoDelta: { [commodity.id]: units },
        // No basis: it was found, not bought. See `applyEncounterResult`.
        message: `Salvaged ${units}× ${commodity.name}.`,
      }
    }

    case 'pirate-demand': {
      if (choiceId === 'pay') return { message: `Paid ${paid} cr to let you pass.` }
      if (percentRoll(`${key}:run`) < 55) return { message: 'You outran them.' }
      // Caught. A shake-down is only ever what the player can actually lose.
      const loss = shakeDown(state.credits, Math.round(draw(`${key}:loss`, 20, 80) * scale))
      if (loss <= 0) return { message: 'They caught you, then found nothing to take.' }
      if (percentRoll(`${key}:caught`) < 25) {
        return {
          creditsDelta: -loss,
          daysDelta: ENCOUNTER_DELAY_DAYS,
          message: `Caught. Lost ${loss} cr and a day.`,
        }
      }
      return { creditsDelta: -loss, message: `Caught. Lost ${loss} cr.` }
    }

    case 'engine-trouble': {
      if (choiceId === 'repair') return { creditsDelta: -paid, message: `Paid ${paid} cr for repairs.` }
      if (percentRoll(`${key}:patch`) < 65) {
        return { daysDelta: ENCOUNTER_DELAY_DAYS, message: 'Held station a day to get her flying.' }
      }
      return { message: 'The coils held. No delay.' }
    }

    case 'space-debris': {
      if (choiceId === 'detour') return { daysDelta: ENCOUNTER_DELAY_DAYS, message: 'Went the long way round.' }
      if (percentRoll(`${key}:scrape`) < 45) {
        const bill = shakeDown(state.credits, Math.round(draw(`${key}:bill`, 20, 60) * scale))
        if (bill <= 0) return { message: 'Clipped through. No credit to your name to bill.' }
        return { creditsDelta: -bill, message: `Scraped the plating. Repair bill ${bill} cr.` }
      }
      return { message: 'Threaded the field without a scratch.' }
    }

    case 'merchant-convoy': {
      if (choiceId !== 'buy') return { message: 'You waved them on.' }
      const free = cargoFree(state)
      if (free <= 0) return { message: 'No room in the hold for a pallet.' }
      const commodity = COMMODITIES[hashString(`${key}:pallet`) % COMMODITIES.length]
      // Quoted against the market the ship is leaving, which the player has
      // already seen: the convoy is offering a discount on what this sector
      // pays today, not an oracle on what the destination will open at.
      const listed =
        state.markets[pending.originPlanetId]?.[commodity.id]?.price ?? commodity.basePrice
      const discount =
        ENCOUNTER_CONVOY_DISCOUNT_MIN +
        (hashString(`${key}:discount`) % 1000) / 1000 *
          (ENCOUNTER_CONVOY_DISCOUNT_MAX - ENCOUNTER_CONVOY_DISCOUNT_MIN)
      const unit = Math.max(1, Math.round(listed * discount))
      // What the hold has room for and the purse has in it, in that order.
      const units = Math.max(
        0,
        Math.min(
          draw(`${key}:units`, ENCOUNTER_CARGO_MIN_UNITS, ENCOUNTER_CARGO_MAX_UNITS),
          free,
          Math.floor(state.credits / unit),
        ),
      )
      if (units <= 0) return { message: 'Could not afford the pallet.' }
      return {
        creditsDelta: -unit * units,
        cargoDelta: { [commodity.id]: units },
        cargoBasis: { [commodity.id]: unit },
        unitsBought: units,
        message: `Bought ${units}× ${commodity.name} at ${unit} cr each.`,
      }
    }

    case 'nav-anomaly': {
      if (choiceId !== 'investigate') return { message: 'You trusted the charts.' }
      const roll = percentRoll(`${key}:anomaly`)
      if (roll < 40) {
        const reward = drawReward(`${key}:anomaly`)
        return { creditsDelta: reward, message: `Found something worth ${reward} cr.` }
      }
      if (roll < 70) {
        return { daysDelta: ENCOUNTER_DELAY_DAYS, message: 'Nothing there. Lost a day looking.' }
      }
      return { message: 'A dead sensor cluster. Nothing worth the detour.' }
    }

    case 'customs-check': {
      if (choiceId === 'expedite') return { creditsDelta: -paid, message: `Paid ${paid} cr to move on.` }
      if (percentRoll(`${key}:comply`) < 30) {
        const fee = shakeDown(state.credits, Math.round(draw(`${key}:fee`, 20, 40) * scale))
        if (fee <= 0) return { message: 'Manifest checked. No credit to collect a fee from.' }
        return { creditsDelta: -fee, message: `Manifest checked. Fee ${fee} cr.` }
      }
      return { message: 'Manifest checked. Nothing to declare.' }
    }

    case 'science-probe': {
      if (choiceId !== 'transmit') return { message: 'You kept your flight data.' }
      // Never the rare band: handing over telemetry is a small payment, and a
      // 400 cr probe tip would make it the best action in the game.
      const reward = drawReward(`${key}:probe`, 120, 120)
      return { creditsDelta: reward, message: `Telemetry sent. Paid ${reward} cr.` }
    }

    case 'fuel-cache': {
      if (choiceId !== 'salvage') return { message: 'You left the beacon behind.' }
      const reward = drawReward(`${key}:cache`, 150)
      return { creditsDelta: reward, message: `Stripped the tanks. ${reward} cr salvage bond.` }
    }

    default: {
      // A save naming a type this build no longer has: `migrate` drops those, and
      // an encounter that survived anyway resolves as "nothing happened" rather
      // than stranding a player mid-jump with no way to land.
      return { message: 'Whatever it was, it passed without incident.' }
    }
  }
}

/**
 * Performs every write an encounter result implies.
 *
 * The single place an encounter touches the game, which is what keeps the
 * guarantees in one place:
 *
 *  - Credits are rounded, and a loss is never allowed to leave the player in
 *    the red. Every loss is already drawn within what the player has, so the
 *    floor here is a backstop, not the mechanism.
 *  - Cargo can never exceed the hold. Free space is checked at resolution, not
 *    only when the choice is offered, and the awarded line is blended into any
 *    basis already held rather than replacing it.
 *  - Salvage enters the hold at a basis of **0**, deliberately: it was found,
 *    not bought, so nothing is invented as spent and net worth does not jump
 *    because the player picked something up. Blending keeps the *equity* of
 *    goods already in the hold exactly where it was - basis × quantity is
 *    conserved across the merge - so the free units are free when they are
 *    sold and the paid ones are not devalued by their arrival.
 *  - Market stock is untouched. Salvage does not restock a market, move a
 *    price, or book trading profit; the goods simply exist in the hold, and the
 *    player sells them into a market like anyone else if they want to.
 *  - Days go through `advanceDay`, so a delay moves markets, market events and
 *    contract deadlines on the ordinary clock.
 */
export function applyEncounterResult(state: GameState, result: EncounterResult): GameState {
  let next = state

  const delta = Number.isFinite(result.creditsDelta) ? Math.round(result.creditsDelta ?? 0) : 0
  if (delta !== 0) {
    next = { ...next, credits: Math.max(0, next.credits + delta) }
  }

  const days = Number.isFinite(result.daysDelta) ? Math.max(0, Math.floor(result.daysDelta ?? 0)) : 0
  for (let i = 0; i < days; i++) {
    next = advanceDay(next)
  }

  const entries = Object.entries(result.cargoDelta ?? {}) as [CommodityId, number][]
  if (entries.length > 0) {
    let cargo = { ...next.cargo }
    const costBasis = { ...next.costBasis }
    // Re-read free space every line: two commodities in one result must not
    // both be sized against the same empty hold.
    let free = cargoFree(next)
    for (const [commodityId, rawQty] of entries) {
      if (!COMMODITY_MAP[commodityId] || free <= 0) continue
      const qty = Math.min(Math.max(0, Math.floor(rawQty)), free)
      if (qty <= 0) continue
      const ownedBefore = cargo[commodityId] ?? 0
      const ownedAfter = ownedBefore + qty
      const unitBasis = Math.max(0, result.cargoBasis?.[commodityId] ?? 0)
      // Same weighted blend `buyCommodity` uses: adding units at a known basis
      // moves the line's basis rather than overwriting what is already in it.
      const basisBefore = cargoBasisAt(next, commodityId)
      costBasis[commodityId] = (basisBefore * ownedBefore + unitBasis * qty) / ownedAfter
      cargo = { ...cargo, [commodityId]: ownedAfter }
      free -= qty
    }
    next = { ...next, cargo, costBasis }
  }

  if (result.unitsBought && result.unitsBought > 0) {
    const units = Math.floor(result.unitsBought)
    next = {
      ...next,
      stats: { ...next.stats, goodsBought: next.stats.goodsBought + units },
    }
  }

  // The encounter is spent the moment its outcome is written, so it cannot be
  // resolved a second time - by a double click, a stale modal, or a reloaded
  // save that still holds the same record.
  return { ...next, pendingEncounter: null }
}

/**
 * Takes a choice and settles the encounter.
 *
 * Refuses anything that is not an open choice on the pending encounter, so a
 * resolved encounter cannot be paid out again and a choice that was never on
 * offer cannot be invented. On success the encounter is spent, its outcome is
 * applied, and the caller is left to finish the flight.
 */
export function chooseEncounter(
  state: GameState,
  choiceId: string,
): { state: GameState; result?: EncounterResult; log?: string; error?: string } {
  const pending = state.pendingEncounter
  if (!pending) return { state, error: 'There is no encounter waiting.' }
  const def = encounterDefinition(pending)
  const choice = def?.choices.find((c) => c.id === choiceId)
  if (!choice) return { state, error: 'That choice is not on offer.' }
  // The authoritative check. The modal disables these buttons, but the guard
  // lives here because a button is not a rule.
  const blocked = choiceBlockReason(state, pending, choiceId)
  if (blocked) return { state, error: blocked }

  const result = resolveEncounterChoice(state, pending, choiceId)
  return {
    state: applyEncounterResult(state, result),
    result,
    log: choice.log,
  }
}