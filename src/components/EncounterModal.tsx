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
 * is described as a gamble rather than quoted at the exact figure the seed
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <GameBadge tone="warn" pulse>
          <IconWarning className="h-3 w-3" />
          Jump interrupted
        </GameBadge>
        <span className="num text-[11px] uppercase tracking-wider text-slate-500">
          Day {fmt(game.day)}
          {destination && (
            <>
              {' '}
              · bound for{' '}
              <span className="inline-flex items-center gap-1 align-middle text-slate-300">
                <PlanetVisual planet={destination} size="xs" />
                {destination.name}
              </span>
            </>
          )}
        </span>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 text-3xl shadow-[0_0_30px_-8px_rgba(251,191,36,0.8)]"
          aria-hidden="true"
        >
          {icon}
        </span>
        <h2 id="encounter-title" className="text-xl font-bold uppercase tracking-wide text-white">
          {title}
        </h2>
      </div>

      <p className="mb-4 text-sm text-slate-300">{description}</p>

      <div className="space-y-2">
        {options.map((option) => {
          const blocked = option.blockedReason !== undefined
          return (
            <button
              key={option.id}
              onClick={() => onResolved(onChoose(option.id))}
              disabled={blocked}
              title={option.blockedReason}
              className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                blocked
                  ? 'cursor-not-allowed border-slate-800 bg-slate-800/30 text-slate-500'
                  : 'border-slate-600 bg-slate-800/70 hover:border-amber-400/70 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold text-white">{option.label}</span>
                {option.cost > 0 ? (
                  <GameBadge tone="warn" title="A certain cost">
                    {fmtMoney(option.cost)} cr
                  </GameBadge>
                ) : null}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {blocked ? option.blockedReason : option.detail}
              </div>
              {!blocked && option.risk && (
                <div className="mt-1 text-xs italic text-amber-300/80">{option.risk}</div>
              )}
              {blocked && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  <IconBlocked className="h-3 w-3" />
                  Unavailable
                </div>
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
        <IconBlocked className="h-3 w-3 shrink-0" />
        Your jump is on hold until you choose. Nothing else can be done until the ship
        lands.
      </p>
    </Modal>
  )
}