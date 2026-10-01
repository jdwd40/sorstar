import type { GameState } from '../types/game'
import { fmt, fmtMoney } from '../utils/format'
import { StatTile } from './ui/StatusChip'
import { IconLog } from './ui/Icons'

export default function LogPanel({ game }: { game: GameState }) {
  const profit = game.stats.tradingProfit

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-indigo-300">
            <IconLog className="h-4 w-4" />
            Flight log
          </h3>
          <div
            className="text-[11px] text-slate-500"
            title="Realised trading profit: what sales paid out, less what the goods cost. Excludes fuel, upkeep and upgrades - see net worth for the whole picture."
          >
            Realised trading profit, fuel and upkeep excluded
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Trading profit"
            value={`${profit >= 0 ? '+' : ''}${fmtMoney(profit)}`}
            tone={profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}
            hint="realised, goods only"
          />
          <StatTile
            label="Units moved"
            value={fmt(game.stats.goodsBought + game.stats.goodsSold)}
            hint={`${fmt(game.stats.goodsBought)} in · ${fmt(game.stats.goodsSold)} out`}
          />
          <StatTile
            label="Contracts"
            value={fmt(game.stats.contractsCompleted)}
            tone={game.stats.contractsFailed > 0 ? 'text-white' : 'text-emerald-300'}
            hint={
              game.stats.contractsFailed > 0
                ? `${fmt(game.stats.contractsFailed)} missed`
                : `${fmtMoney(game.stats.contractRevenue)} in fees`
            }
          />
          <StatTile
            label="Jumps"
            value={fmt(game.stats.tripsMade)}
            hint={`${fmtMoney(game.stats.upgradesInvested)} in upgrades`}
          />
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h4 className="panel-heading mb-3">Entries</h4>
        {game.log.length === 0 ? (
          <p className="text-sm text-slate-500">The log is blank so far.</p>
        ) : (
          <ol className="relative ml-1 space-y-3 border-l border-slate-700/70 pl-5">
            {game.log.map((entry, i) => (
              <li key={`${entry.day}-${i}`} className="relative">
                <span className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[9px] ring-2 ring-indigo-400/40">
                  <span aria-hidden="true">{entry.icon}</span>
                </span>
                <div className="num text-[11px] uppercase tracking-wider text-slate-500">
                  Day {fmt(entry.day)}
                </div>
                <div className="text-sm leading-snug text-slate-200">{entry.text}</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}