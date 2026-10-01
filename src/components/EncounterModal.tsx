import type { GameState } from '../types/game'
import { PLANET_MAP } from '../data/gameData'
import { describeEncounter, encounterOptions } from '../services/encounterService'
import { fmtMoney } from '../utils/format'
import Modal from './Modal'
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
  const destination = PLANET_MAP[pending.destinationPlanetId]?.name

  return (
    <Modal onClose={() => {}} labelledBy="encounter-title" dismissable={false}>
      <div className="flex items-center gap-3 mb-1">
        <span className="text-4xl">{icon}</span>
        <h2 id="encounter-title" className="text-2xl font-bold text-white uppercase tracking-wide">
          {title}
        </h2>
      </div>
      {destination && (
        <p className="text-xs uppercase tracking-wider text-slate-500 mb-3">
          In transit to {destination} · day {game.day}
        </p>
      )}
      <p className="text-sm text-slate-300 mb-5">{description}</p>

      <div className="space-y-3">
        {options.map((option) => {
          const blocked = option.blockedReason !== undefined
          return (
            <button
              key={option.id}
              onClick={() => onResolved(onChoose(option.id))}
              disabled={blocked}
              title={option.blockedReason}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                blocked
                  ? 'bg-slate-800/40 border-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-800/80 border-slate-600 hover:bg-slate-700 hover:border-indigo-400'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-white">
                  {option.label}
                  {option.cost > 0 ? (
                    <span className="text-amber-300"> — {fmtMoney(option.cost)} cr</span>
                  ) : null}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {blocked ? option.blockedReason : option.detail}
              </div>
              {!blocked && option.risk && (
                <div className="text-xs text-slate-500 mt-0.5">{option.risk}</div>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-[11px] text-slate-600 mt-4">
        Your jump is on hold until you choose. Nothing else can be done until the ship
        lands.
      </p>
    </Modal>
  )
}