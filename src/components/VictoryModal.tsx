import type { GameState } from '../types/game'
import { GAME_TARGET_NET_WORTH } from '../data/gameData'
import { fmt, fmtMoney } from '../utils/format'
import Modal from './Modal'

export default function VictoryModal({
  game,
  onContinue,
  onNewGame,
}: {
  game: GameState
  onContinue: () => void
  onNewGame: () => void
}) {
  return (
    <Modal onClose={onContinue}>
      <div className="text-center">
        <div className="text-6xl mb-2">🏆</div>
        <h2 className="text-3xl font-black tracking-wide text-amber-300 text-glow mb-2">
          TRAILBLAZER
        </h2>
        <p className="text-slate-300 mb-1">
          Your net worth has crossed{' '}
          <b className="text-white">{fmtMoney(GAME_TARGET_NET_WORTH)}</b>.
        </p>
        <p className="text-slate-400 text-sm mb-5">
          Day {fmt(game.stats.victoryDay ?? game.day)} — the sector's traders now call
          your name in the same breath as the old merchant houses.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 text-left">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs uppercase tracking-wider text-slate-400">Net Worth</div>
            <div className="text-lg font-bold text-white">{fmtMoney(game.stats.maxNetWorth)}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs uppercase tracking-wider text-slate-400">Total Profit</div>
            <div className={`text-lg font-bold ${game.stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {game.stats.totalProfit >= 0 ? '+' : ''}{fmtMoney(game.stats.totalProfit)}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs uppercase tracking-wider text-slate-400">Trips Made</div>
            <div className="text-lg font-bold text-white">{fmt(game.stats.tripsMade)}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs uppercase tracking-wider text-slate-400">Days Played</div>
            <div className="text-lg font-bold text-white">{fmt(game.day)}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs uppercase tracking-wider text-slate-400">Cargo Moved</div>
            <div className="text-lg font-bold text-white">{fmt(game.stats.goodsBought + game.stats.goodsSold)}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs uppercase tracking-wider text-slate-400">Upgrades</div>
            <div className="text-lg font-bold text-indigo-300">{fmtMoney(game.stats.upgradesInvested)}</div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onContinue} className="btn-primary flex-1">
            Continue exploring
          </button>
          <button onClick={onNewGame} className="btn-ghost flex-1">
            Start new game
          </button>
        </div>
      </div>
    </Modal>
  )
}