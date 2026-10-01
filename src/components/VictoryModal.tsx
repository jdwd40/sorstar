import type { GameState } from '../types/game'
import { GAME_TARGET_NET_WORTH } from '../data/gameData'
import { fmt, fmtMoney } from '../utils/format'
import Modal from './Modal'
import { StatTile } from './ui/StatusChip'
import { IconMark } from './ui/Icons'

export default function VictoryModal({
  game,
  onContinue,
  onNewGame,
}: {
  game: GameState
  onContinue: () => void
  onNewGame: () => void
}) {
  const profit = game.stats.tradingProfit
  return (
    <Modal onClose={onContinue} labelledBy="victory-title" tone="alert">
      <div className="text-center">
        <IconMark className="mx-auto mb-2 h-14 w-14 text-amber-300 text-glow" />
        <h2
          id="victory-title"
          className="mb-2 text-3xl font-black tracking-wide text-amber-200 text-glow"
        >
          TRAILBLAZER
        </h2>
        <p className="mb-1 text-slate-300">
          Your net worth has crossed <b className="num text-white">{fmtMoney(GAME_TARGET_NET_WORTH)}</b>.
        </p>
        <p className="mb-5 text-sm text-slate-400">
          Day <span className="num">{fmt(game.stats.victoryDay ?? game.day)}</span> — the sector's
          traders now call your name in the same breath as the old merchant houses.
        </p>

        <div className="mb-6 grid grid-cols-2 gap-2 text-left sm:grid-cols-3">
          <StatTile
            label="Peak net worth"
            value={fmtMoney(game.stats.maxNetWorth)}
            title="The highest net worth you have reached, which is what you won on. Your net worth right now may be lower."
          />
          <StatTile
            label="Trading profit"
            value={`${profit >= 0 ? '+' : ''}${fmtMoney(profit)}`}
            tone={profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}
            title="Realised trading profit: what sales paid out, less what the goods cost. Excludes fuel, upkeep and upgrades."
          />
          <StatTile label="Trips made" value={fmt(game.stats.tripsMade)} />
          <StatTile label="Days played" value={fmt(game.day)} />
          <StatTile
            label="Units traded"
            value={fmt(game.stats.goodsBought + game.stats.goodsSold)}
            title="Units bought plus units sold. A unit that travels both ways counts twice - it is counted each time it crosses the market."
          />
          <StatTile
            label="Upgrade spend"
            value={fmtMoney(game.stats.upgradesInvested)}
            tone="text-indigo-200"
            title="Credits sunk into ship upgrades. Net worth adds this back, so buying an upgrade never moves the goal on its own."
          />
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