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
import { moveLabel, moveTone } from './marketBadges'
import { IconWarning } from './Icons'

interface MarketAlertProps {
  game: GameState
  planet: Planet
  className?: string
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

  const pricey = active.some((event) => eventMoves(event).some((m) => m.multiplier > 1))

  return (
    <div
      className={`rounded-xl border p-3 ${
        pricey
          ? 'border-amber-400/30 bg-amber-500/10 shadow-[0_0_28px_-18px_rgba(251,191,36,0.9)]'
          : 'border-cyan-400/25 bg-cyan-500/10 shadow-[0_0_28px_-18px_rgba(34,211,238,0.9)]'
      } ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5">
          <IconWarning className={`h-3.5 w-3.5 ${pricey ? 'text-amber-300' : 'text-cyan-300'}`} />
          <span className={`panel-heading ${pricey ? 'text-amber-300/90' : 'text-cyan-300/90'}`}>
            Market alert
          </span>
        </span>
        {active.map((event) => (
          <MarketEventLine key={event.id} event={event} day={game.day} />
        ))}
      </div>
    </div>
  )
}

/** One event: what it is called, what it does to which goods, and for how long. */
function MarketEventLine({ event, day }: { event: MarketEvent; day: number }) {
  const def = eventDefinition(event)
  const days = eventDaysRemaining(event, day)
  const moves = eventMoves(event)

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className="text-sm font-semibold text-white"
        title={def?.description ?? undefined}
      >
        {def?.name ?? event.eventType}
      </span>
      {moves.map((move) => {
        const commodity = COMMODITY_MAP[move.commodityId]
        return (
          <GameBadge
            key={move.commodityId}
            tone={moveTone(move.multiplier)}
            title={`${commodity?.name ?? move.commodityId} ${moveLabel(move)} while this runs`}
          >
            <span aria-hidden="true">{commodity?.icon}</span>
            {commodity?.name ?? move.commodityId} {moveLabel(move)}
          </GameBadge>
        )
      })}
      <span className="text-[11px] text-slate-400">
        {fmt(days)} day{days === 1 ? '' : 's'} left
      </span>
    </span>
  )
}
