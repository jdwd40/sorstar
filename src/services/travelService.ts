import type { EncounterResult, GameState, PendingEncounter } from '../types/game'
import { PLANET_MAP, distanceBetween, fuelCostBetween } from '../data/gameData'
import { advanceDay } from './marketService'
import { settleContracts } from './contractService'
import { chooseEncounter, encounterDaysFlown, rollEncounter } from './encounterService'

export function travelCost(state: GameState, destId: string): number {
  return fuelCostBetween(state.planetId, destId, state.ship.engineLevel)
}

export function canTravel(state: GameState, destId: string): { ok: boolean; reason?: string } {
  const from = PLANET_MAP[state.planetId]
  const to = PLANET_MAP[destId]
  if (!from || !to) return { ok: false, reason: 'Unknown destination.' }
  if (from.id === to.id) return { ok: false, reason: 'Already docked here.' }
  // A jump already under way has to be finished before another one can start.
  // The ship is between planets, so there is nowhere to set off from.
  if (state.pendingEncounter) {
    return { ok: false, reason: 'An encounter is still unresolved mid-jump.' }
  }
  const cost = travelCost(state, destId)
  if (cost > state.credits) {
    return { ok: false, reason: `Not enough credits for fuel (${cost} cr).` }
  }
  return { ok: true }
}

export interface TravelResult {
  state: GameState
  error?: string
  toId?: string
  fromName?: string
  toName?: string
  distanceLy?: number
  fuelCost?: number
  days?: number
  arriveDay?: number
  /**
   * Set when the jump was interrupted: the ship has left, and the encounter is
   * waiting to be played out. There is no arrival until it is.
   */
  encounter?: PendingEncounter
}

export interface EncounterResolution {
  state: GameState
  error?: string
  result?: EncounterResult
  /** Past-tense phrase for the log: "assisted a damaged freighter". */
  log?: string
  /** What the flight cost, for the arrival report and the log. */
  travel?: TravelResult
}

/**
 * Flies a jump, and occasionally not all the way.
 *
 * A quiet journey is the original behaviour: fuel is charged, every day in
 * transit advances the markets, and the contracts settle once on arrival.
 *
 * An interrupted one is the same jump with a checkpoint in it. The ship leaves,
 * the fuel is spent, the days flown so far are advanced - and the flight stops
 * where it is, with the encounter waiting in `pendingEncounter`. `planetId` stays
 * the origin: the player has not arrived, and the market panel behind the modal
 * is still the one they left. The rest of the jump is flown by
 * `resolveEncounter`, which is also the only thing that can complete it - so a
 * reload mid-jump resumes the same encounter on the same day rather than
 * arriving somewhere the player never chose to resolve.
 */
export function travel(
  state: GameState,
  destId: string,
): TravelResult {
  const from = PLANET_MAP[state.planetId]
  const to = PLANET_MAP[destId]
  if (!from || !to || from.id === to.id) {
    return { state, error: 'Invalid destination.' }
  }
  // Same guard as `canTravel`, in the service rather than only in the UI: a
  // stale button must not be able to start a second flight out of a jump that
  // has already burned its fuel.
  if (state.pendingEncounter) {
    return { state, error: 'An encounter is still unresolved mid-jump.' }
  }
  const cost = travelCost(state, destId)
  if (cost > state.credits) {
    return { state, error: `Not enough credits for fuel (${cost} cr).` }
  }

  const days = distanceBetween(from, to)
  const departed: GameState = {
    ...state,
    credits: state.credits - cost,
    stats: {
      ...state.stats,
      // Counted once, when the ship leaves. Resolution never counts it again.
      tripsMade: state.stats.tripsMade + 1,
    },
  }

  const encounter = rollEncounter(state, destId, days, cost)
  if (encounter) {
    let partial = departed
    const flown = encounterDaysFlown(encounter)
    for (let i = 0; i < flown; i++) {
      partial = advanceDay(partial)
    }
    return {
      state: { ...partial, pendingEncounter: encounter },
      encounter,
      toId: to.id,
      fromName: from.name,
      toName: to.name,
      distanceLy: days,
      fuelCost: cost,
      days,
    }
  }

  let next = departed
  for (let i = 0; i < days; i++) {
    next = advanceDay(next)
  }
  next = settleContracts({ ...next, planetId: to.id })
  // Contracts settle once, on arrival, not once per day in transit: a contract
  // that expired mid-jump is still a single failure with a single log line
  // wherever the ship happens to end up. Settling here also means new work is
  // offered by the planet the player actually reached.
  next = settleContracts(next)
  return {
    state: next,
    toId: to.id,
    fromName: from.name,
    toName: to.name,
    distanceLy: days,
    fuelCost: cost,
    days,
    arriveDay: next.day,
  }
}

/**
 * Plays out a pending encounter and lands the ship.
 *
 * The encounter's outcome is applied first - including any day it costs, which
 * goes through `advanceDay` and so moves markets, market events and contract
 * deadlines exactly as a waited day does. The remaining days of the jump are
 * then flown and the contracts settle on arrival, so the player lands with the
 * markets they actually flew into.
 *
 * Guards, all of them in here rather than in the modal: no encounter means
 * nothing to resolve; a choice that is not on offer is refused; a choice that
 * cannot be afforded is refused rather than clamped; and resolving clears the
 * pending record in the same write as its outcome, so it cannot be claimed
 * twice - by a double click, or by a save reloaded before the write landed.
 */
export function resolveEncounter(
  state: GameState,
  choiceId: string,
): EncounterResolution {
  const pending = state.pendingEncounter
  if (!pending) return { state, error: 'There is no encounter waiting.' }

  const chosen = chooseEncounter(state, choiceId)
  if (chosen.error || !chosen.result) {
    return { state, error: chosen.error ?? 'That choice cannot be taken.' }
  }

  const from = PLANET_MAP[pending.originPlanetId]
  const to = PLANET_MAP[pending.destinationPlanetId]
  let next: GameState = { ...chosen.state, planetId: pending.destinationPlanetId }

  // Whatever is left of the flight, after the days the encounter itself spent.
  const remaining = Math.max(0, pending.journeyDays - encounterDaysFlown(pending))
  for (let i = 0; i < remaining; i++) {
    next = advanceDay(next)
  }
  next = settleContracts(next)

  return {
    state: next,
    result: chosen.result,
    log: chosen.log,
    travel: {
      state: next,
      toId: pending.destinationPlanetId,
      fromName: from?.name ?? pending.originPlanetId,
      toName: to?.name ?? pending.destinationPlanetId,
      distanceLy: pending.journeyDays,
      fuelCost: pending.fuelCost,
      days: next.day - pending.departureDay,
      arriveDay: next.day,
    },
  }
}