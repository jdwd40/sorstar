import type { EventCommodityMove } from '../../services/marketEventService'

/**
 * How to colour a commodity move.
 *
 * Read from the modifier rather than from the event's name: a multiplier above 1
 * is price pressure - scarcity, demand, a strike - and belongs in amber, and one
 * below 1 is a glut, a dump, a new seam, and belongs in green. The event
 * definitions happen to agree with that today, but the modifier is the thing
 * that decides it, so a renamed or new event is coloured correctly for free.
 */
export function moveTone(multiplier: number): 'warn' | 'good' {
  return multiplier > 1 ? 'warn' : 'good'
}

export function moveLabel(move: EventCommodityMove): string {
  const pct = Math.round((move.multiplier - 1) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}