import type { GameState, Planet } from '../types/game'
import { PLANET_MAP, fuelCostAtLevel } from '../data/gameData'
import { advanceDay } from './marketService'

export function distanceBetween(a: Planet, b: Planet): number {
  const dx = a.position.x - b.position.x
  const dy = a.position.y - b.position.y
  return Math.max(1, Math.round(Math.sqrt(dx * dx + dy * dy) / 10))
}

export function travelCost(state: GameState, destId: string): number {
  const from = PLANET_MAP[state.planetId]
  const to = PLANET_MAP[destId]
  if (!from || !to || from.id === to.id) return 0
  const ly = distanceBetween(from, to)
  const fuelPerLy = fuelCostAtLevel(state.ship.engineLevel)
  return Math.max(1, Math.round(ly * fuelPerLy))
}

export function travelDays(state: GameState, destId: string): number {
  const from = PLANET_MAP[state.planetId]
  const to = PLANET_MAP[destId]
  if (!from || !to) return 1
  return distanceBetween(from, to)
}

export function canTravel(state: GameState, destId: string): { ok: boolean; reason?: string } {
  const from = PLANET_MAP[state.planetId]
  const to = PLANET_MAP[destId]
  if (!from || !to) return { ok: false, reason: 'Unknown destination.' }
  if (from.id === to.id) return { ok: false, reason: 'Already docked here.' }
  const cost = travelCost(state, destId)
  if (cost > state.credits) {
    return { ok: false, reason: `Not enough credits for fuel (${cost} cr).` }
  }
  return { ok: true }
}

export interface TravelResult {
  state: GameState
  error?: string
  traveled: boolean
  fromId?: string
  toId?: string
  fromName?: string
  toName?: string
  distanceLy?: number
  fuelCost?: number
  days?: number
  arriveDay?: number
}

export function travel(
  state: GameState,
  destId: string,
): TravelResult {
  const from = PLANET_MAP[state.planetId]
  const to = PLANET_MAP[destId]
  if (!from || !to || from.id === to.id) {
    return { state, error: 'Invalid destination.', traveled: false }
  }
  const cost = travelCost(state, destId)
  if (cost > state.credits) {
    return { state, error: `Not enough credits for fuel (${cost} cr).`, traveled: false }
  }

  const days = travelDays(state, destId)
  let next: GameState = {
    ...state,
    credits: state.credits - cost,
    planetId: destId,
    stats: {
      ...state.stats,
      tripsMade: state.stats.tripsMade + 1,
    },
  }
  for (let i = 0; i < days; i++) {
    next = advanceDay(next)
  }
  return {
    state: next,
    traveled: true,
    fromId: from.id,
    toId: to.id,
    fromName: from.name,
    toName: to.name,
    distanceLy: distanceBetween(from, to),
    fuelCost: cost,
    days,
    arriveDay: next.day,
  }
}