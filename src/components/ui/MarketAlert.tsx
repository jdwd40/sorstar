import type { GameState, MarketEvent, Planet } from '../../types/game'
import { COMMODITY_MAP } from '../../data/gameData'
import {
  eventDaysRemaining,
  eventDefinition,
  eventMoves,
  eventsAt,
} from '../../services/marketEventService'
import { fmt } from '../../utils/format'
import GameBadge from './GameBadge'
import { IconSurge, IconWarning } from './Icons'

interface MarketAlertProps {
  game: GameState
  planet: Planet
  className?: string
}

/**
 * A commodity a market event is moving, and by how much.
 *
 * Coloured and pointed by the multiplier rather than the event's name: above 1
 * is price pressure (amber), below 1 a glut (green). A renamed or new event is
 * coloured correctly for free, and the market table and this strip read the
 * same move the same way.
 */
export function EventMoveBadge({
  scale,
  label,
  title,
}: {
  scale: number
  label?: string
  title?: string
}) {
  const pct = Math.round((scale - 1) * 100)
  return (
    <GameBadge
      tone={scale > 1 ? 'warn' : 'good'}
      icon={<IconSurge down={scale < 1} className="h-3 w-3" />}
      title={title}
    >
      {label && <span>{label}</span>}
      <span className="num">
        {pct >= 0 ? '+' : ''}
        {pct}%
      </span>
    </GameBadge>
  )
}

/**
 * What is happening to this market right now.
 *
 * Stated as a percentage on the goods themselves rather than as prose, because
 * the number is the part the player can act on - and kept to a strip above the
 * table rather than a banner, so a market running normally still looks like a
 * market running normally.
 */
export default function MarketAlert({ game, planet, className = '' }: MarketAlertProps) {
  const active = eventsAt(game.activeEvents, planet.id, game.day)
  // No events is the normal case: an empty panel would be noise on most days.
  if (active.length === 0) return null

  return (
    <div className={`grid gap-2 ${active.length > 1 ? 'sm:grid-cols-2' : ''} ${className}`}>
      {active.map((event) => (
        <MarketEventCard key={event.id} event={event} day={game.day} />
      ))}
    </div>
  )
}

/** One event: what it is called, what it does to which goods, and for how long. */
function MarketEventCard({ event, day }: { event: MarketEvent; day: number }) {
  const def = eventDefinition(event)
  const days = eventDaysRemaining(event, day)
  const moves = eventMoves(event)
  // Pressure if anything it touches gets dearer; a glut otherwise.
  const pricey = moves.some((m) => m.multiplier > 1)

  return (
    <div
      className={`relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 ${
        pricey
          ? 'border-amber-400/35 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent'
          : 'border-cyan-400/30 bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
          pricey
            ? 'event-pulse border-amber-300/60 bg-amber-500/20 text-amber-200'
            : 'border-cyan-300/60 bg-cyan-500/20 text-cyan-200'
        }`}
        aria-hidden="true"
      >
        {pricey ? <IconWarning className="h-4 w-4" /> : <IconSurge down className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
              pricey ? 'text-amber-300/90' : 'text-cyan-300/90'
            }`}
          >
            Market alert
          </span>
          <span className="text-[11px] text-slate-400">
            {fmt(days)} day{days === 1 ? '' : 's'} left
          </span>
        </div>
        <div
          className="text-sm font-bold uppercase tracking-wide text-white"
          title={def?.description ?? undefined}
        >
          {def?.name ?? event.eventType}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {moves.map((move) => {
          const commodity = COMMODITY_MAP[move.commodityId]
          return (
            <EventMoveBadge
              key={move.commodityId}
              scale={move.multiplier}
              label={commodity?.name ?? move.commodityId}
              title={def?.description}
            />
          )
        })}
      </div>
    </div>
  )
}
