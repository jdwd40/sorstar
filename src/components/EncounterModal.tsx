import type { GameState } from '../types/game'
import { PLANET_MAP } from '../data/gameData'
import { describeEncounter, encounterOptions } from '../services/encounterService'
import { fmt, fmtMoney } from '../utils/format'
import Modal from './Modal'
import GameBadge from './ui/GameBadge'
import PlanetVisual from './ui/PlanetVisual'
import { IconBlocked, IconWarning } from './ui/Icons'
import type { ActionResult } from '../context/GameContext'

interface EncounterModalProps {
  game: GameState
  /** Plays the choice out. Errors are surfaced by the caller's toast. */
  onChoose: (choiceId: string) => ActionResult
  /** Called after a choice resolves, so the page can show where the ship lands. */
  onResolved: (result: ActionResult) => void
}

/**
 * The one decision an interrupted jump puts to the player.
 *
 * Modal because it has to be answered: the ship is mid-jump, and the rules that
 * make that safe live in the service rather than in this component - the modal
 * disables a choice the player cannot afford, and the resolver refuses it again
 * if the click arrives anyway. It cannot be dismissed, because there is nowhere
 * to dismiss it *to*; every other action is refused until it is answered.
 *
 * Costs are shown where they are certain and hidden where they are not. A
 * quoted payment is never a surprise, and anything the player is gambling on
 * is marked as a gamble rather than quoted at the exact figure the seed
 * already knows.
 */
export default function EncounterModal({ game, onChoose, onResolved }: EncounterModalProps) {
  const pending = game.pendingEncounter
  if (!pending) return null
  const { title, icon, description } = describeEncounter(pending)
  const options = encounterOptions(game, pending)
  const destination = PLANET_MAP[pending.destinationPlanetId]

  return (
    <Modal onClose={() => {}} labelledBy="encounter-title" dismissable={false} tone="alert">
      <div className="relative -mx-6 -mt-6 mb-4 overflow-hidden border-b border-amber-400/20 bg-gradient-to-b from-amber-500/15 to-transparent px-6 pb-4 pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <GameBadge tone="warn" pulse icon={<IconWarning className="h-3 w-3" />}>
            Jump interrupted
          </GameBadge>
          <span className="num flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-400">
            Day {fmt(game.day)}
            {destination && (
              <>
                <span className="text-slate-600">·</span>
                bound for
                <PlanetVisual planet={destination} size="xs" />
                <span className="text-slate-200">{destination.name}</span>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span
            className="event-pulse flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-amber-400/50 bg-slate-950/70 text-4xl"
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2
              id="encounter-title"
              className="text-2xl font-black uppercase leading-tight tracking-wide text-amber-50"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-300">{description}</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {options.map((option) => {
          const blocked = option.blockedReason !== undefined
          // Certain: the cost is quoted. Risky: the outcome is not. Otherwise
          // the choice is free and its result is known.
          const kind = option.risk ? 'risky' : option.cost > 0 ? 'paid' : 'safe'
          return (
            <button
              key={option.id}
              onClick={() => onResolved(onChoose(option.id))}
              disabled={blocked}
              title={option.blockedReason}
              className={`group w-full rounded-xl border px-4 py-3 text-left transition-all ${
                blocked
                  ? 'cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-500'
                  : kind === 'risky'
                    ? 'border-amber-400/30 bg-slate-800/60 hover:border-amber-300/80 hover:bg-amber-500/10 hover:shadow-[0_0_24px_-10px_rgba(251,191,36,0.9)]'
                    : 'border-slate-600/80 bg-slate-800/60 hover:border-indigo-300/80 hover:bg-indigo-500/10 hover:shadow-[0_0_24px_-10px_rgba(129,140,248,0.9)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`text-base font-bold ${blocked ? 'text-slate-500' : 'text-white'}`}>
                  {option.label}
                </span>
                {blocked ? (
                  <GameBadge tone="neutral" icon={<IconBlocked className="h-3 w-3" />}>
                    Unavailable
                  </GameBadge>
                ) : kind === 'paid' ? (
                  <GameBadge tone="info" title="A certain cost, charged exactly">
                    <span className="num">-{fmtMoney(option.cost)}</span>
                  </GameBadge>
                ) : kind === 'risky' ? (
                  <GameBadge tone="warn" title="The outcome is not certain">
                    {option.cost > 0 && <span className="num">-{fmtMoney(option.cost)} ·</span>}
                    risky
                  </GameBadge>
                ) : (
                  <GameBadge tone="good" title="No cost">
                    free
                  </GameBadge>
                )}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {blocked ? option.blockedReason : option.detail}
              </div>
              {!blocked && option.risk && (
                <div className="mt-1 text-xs italic text-amber-300/90">{option.risk}</div>
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
        <IconBlocked className="h-3 w-3 shrink-0" />
        Your jump is on hold until you choose.
      </p>
    </Modal>
  )
}
