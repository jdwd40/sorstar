import type { CommodityId, LogEntry, MarketEvent } from '../types/game'
import {
  COMMODITY_MAP,
  EVENT_MAX_DAYS,
  EVENT_MIN_DAYS,
  EVENT_SPAWN_CHANCE_PERCENT,
  MARKET_EVENTS,
  MARKET_EVENT_MAP,
  MAX_ACTIVE_EVENTS,
  PLANET_MAP,
  PLANETS,
} from '../data/gameData'
import type { MarketEventDefinition } from '../data/gameData'
import { hashString } from '../utils/hash'

/**
 * Temporary market disruptions: a crop failure here, a mining strike there,
 * each one bending a single commodity's price for a few days.
 *
 * The whole system is three things. A draw decides, on each new day, whether an
 * event starts somewhere and which one it is; an event's definition supplies a
 * price multiplier; and `marketService` multiplies that into the price it
 * already computes. Nothing here stores a price, and nothing here decides one.
 *
 * Every draw is seeded from the day number, so events are reproducible: the
 * same save replayed day by day produces the same events, and only the events
 * actually running are kept - never a schedule of ones yet to come.
 */

/** Stable id for one event instance. Derived, never random, so it survives a save round-trip. */
export function marketEventId(eventType: string, planetId: string, startDay: number): string {
  return `${eventType}@${planetId}#${startDay}`
}

/** Active on `startDay` through `endDay - 1`, and gone on `endDay` itself. */
export function isEventActive(event: MarketEvent, day: number): boolean {
  return day >= event.startDay && day < event.endDay
}

/** Whole days left, counting today. Zero on the event's final day. */
export function eventDaysRemaining(event: MarketEvent, day: number): number {
  return Math.max(0, event.endDay - day)
}

export interface EventCommodityMove {
  commodityId: CommodityId
  multiplier: number
}

/**
 * The definition behind an event. Null only if a save names a type the current
 * build no longer has, which `migrate` drops; callers fall back to the raw type.
 */
export function eventDefinition(event: MarketEvent): MarketEventDefinition | null {
  return MARKET_EVENT_MAP[event.eventType] ?? null
}

/** The commodities one event is bending, with their multipliers. */
export function eventMoves(event: MarketEvent): EventCommodityMove[] {
  const def = eventDefinition(event)
  if (!def) return []
  return (Object.keys(def.modifiers) as CommodityId[])
    .filter((cid) => Number.isFinite(def.modifiers[cid]))
    .map((cid) => ({ commodityId: cid, multiplier: def.modifiers[cid] as number }))
}

/** Active events at one planet, soonest to end first. */
export function eventsAt(
  events: readonly MarketEvent[],
  planetId: string,
  day: number,
): MarketEvent[] {
  return events
    .filter((e) => e.planetId === planetId && isEventActive(e, day))
    .sort((a, b) => a.endDay - b.endDay)
}

/** Every active event in the sector, soonest to end first. */
export function sectorEvents(events: readonly MarketEvent[], day: number): MarketEvent[] {
  return events.filter((e) => isEventActive(e, day)).sort((a, b) => a.endDay - b.endDay)
}

/**
 * The multiplier the active events put on one commodity at one planet.
 *
 * 1 when nothing is running. Overlaps cannot happen on the same planet (see
 * `conflictsWith`), so this is normally a single event's multiplier; it
 * multiplies rather than picks, so a hand-edited save with two overlapping
 * events still prices coherently instead of throwing one away.
 */
export function commodityEventScale(
  events: readonly MarketEvent[],
  planetId: string,
  commodityId: CommodityId,
  day: number,
): number {
  let scale = 1
  for (const event of events) {
    if (event.planetId !== planetId || !isEventActive(event, day)) continue
    const def = MARKET_EVENT_MAP[event.eventType]
    const mod = def?.modifiers[commodityId]
    if (mod !== undefined && Number.isFinite(mod) && mod > 0) scale *= mod
  }
  return scale
}

/** Two events collide when they are on one planet and touch a shared commodity. */
function conflictsWith(
  active: readonly MarketEvent[],
  planetId: string,
  def: MarketEventDefinition,
): boolean {
  const wanted = Object.keys(def.modifiers) as CommodityId[]
  return active.some((event) => {
    if (event.planetId !== planetId) return false
    const other = MARKET_EVENT_MAP[event.eventType]?.modifiers ?? {}
    return wanted.some((cid) => other[cid] !== undefined)
  })
}

/**
 * Whether an event starts on `day`, and if so where.
 *
 * A single flat roll decides *whether*, so most days have no event at all -
 * the sector is meant to be quiet. The planet and definition are then swept in
 * a deterministic order until one is legal, which keeps a blocked slot from
 * becoming "no event today" when somewhere else in the sector was free.
 */
function rollEventForDay(day: number, active: readonly MarketEvent[]): MarketEvent | null {
  if (active.length >= MAX_ACTIVE_EVENTS) return null
  const roll = hashString(`market-event:spawn:${day}`) % 100
  if (roll >= EVENT_SPAWN_CHANCE_PERCENT) return null

  const slots = PLANETS.length * MARKET_EVENTS.length
  const offset = hashString(`market-event:pick:${day}`) % slots
  const duration =
    EVENT_MIN_DAYS +
    (hashString(`market-event:span:${day}`) % (EVENT_MAX_DAYS - EVENT_MIN_DAYS + 1))

  for (let i = 0; i < slots; i++) {
    const slot = (offset + i) % slots
    const planet = PLANETS[slot % PLANETS.length]
    const def = MARKET_EVENTS[Math.floor(slot / PLANETS.length)]
    if (conflictsWith(active, planet.id, def)) continue
    return {
      id: marketEventId(def.type, planet.id, day),
      eventType: def.type,
      planetId: planet.id,
      startDay: day,
      endDay: day + duration,
    }
  }
  return null
}

/**
 * The event list one day later: finished events dropped, then at most one new
 * event drawn. Called from `advanceDay`, so travel advances event lifetimes by
 * running it once per day in transit like everything else.
 */
export function advanceMarketEvents(
  events: readonly MarketEvent[],
  day: number,
): MarketEvent[] {
  const kept = events.filter((e) => isEventActive(e, day))
  const started = rollEventForDay(day, kept)
  return started ? [...kept, started] : kept
}

/** "Food +45%, Water -20%", for the log and the alert panels. */
export function describeEventMoves(event: MarketEvent): string {
  return eventMoves(event)
    .map(({ commodityId, multiplier }) => {
      const pct = Math.round((multiplier - 1) * 100)
      return `${COMMODITY_MAP[commodityId].name} ${pct >= 0 ? '+' : ''}${pct}%`
    })
    .join(', ')
}

/**
 * Log lines for the events that began or ended at the player's planet.
 *
 * Scoped to one planet on purpose: a jump can cross days in which events
 * started and finished everywhere else in the sector, and logging those would
 * bury the jump in noise about places the player never saw. The planet passed
 * is the one the player is at *after* the move, so an arrival reports what
 * they flew into.
 */
export function marketEventLogEntries(
  before: readonly MarketEvent[],
  after: readonly MarketEvent[],
  planetId: string,
  day: number,
): LogEntry[] {
  const previousIds = new Set(before.filter((e) => e.planetId === planetId).map((e) => e.id))
  const entries: LogEntry[] = []

  for (const event of after) {
    if (event.planetId !== planetId || previousIds.has(event.id)) continue
    const def = MARKET_EVENT_MAP[event.eventType]
    const planetName = PLANET_MAP[planetId]?.name ?? planetId
    if (!def) continue
    entries.push({
      day,
      icon: '⚠️',
      text: `${def.name} at ${planetName}: ${describeEventMoves(event)} for ${eventDaysRemaining(event, day)} day${
        eventDaysRemaining(event, day) === 1 ? '' : 's'
      }.`,
    })
  }

  for (const event of before) {
    if (event.planetId !== planetId) continue
    if (after.some((e) => e.id === event.id)) continue
    const def = MARKET_EVENT_MAP[event.eventType]
    const planetName = PLANET_MAP[planetId]?.name ?? planetId
    if (!def) continue
    entries.push({
      day,
      icon: '✅',
      text: `${def.name} at ${planetName} has ended. ${describeEventMoves(event)} is back to normal.`,
    })
  }

  return entries
}