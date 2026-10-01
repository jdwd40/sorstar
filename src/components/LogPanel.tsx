import type { GameState } from '../types/game'
import { fmt, fmtMoney } from '../utils/format'

export default function LogPanel({ game }: { game: GameState }) {
  const profit = game.stats.tradingProfit
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-lg font-semibold text-indigo-300">📜 Flight Log</h3>
        <div
          className="text-xs text-slate-500"
          title="Realised trading profit: what sales paid out, less what the goods cost. Excludes fuel, upkeep and upgrades - see net worth for the whole picture."
        >
          Trading profit:{' '}
          <span className={profit >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
            {profit >= 0 ? '+' : ''}{fmtMoney(profit)}
          </span>
          {' · '}bought {fmt(game.stats.goodsBought)} · sold {fmt(game.stats.goodsSold)} units
        </div>
      </div>

      {/* Contracts are tracked apart from trading profit: the fee is not a
          margin, the goods were still bought at market. Counters, not a list -
          a resolved contract has already been logged and paid. */}
      {(game.stats.contractsCompleted > 0 || game.stats.contractsFailed > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
          <span>
            Contracts:{' '}
            <span className="text-emerald-400 font-semibold">
              {fmt(game.stats.contractsCompleted)} delivered
            </span>
            {game.stats.contractsFailed > 0 ? (
              <>
                {' · '}
                <span className="text-red-400 font-semibold">
                  {fmt(game.stats.contractsFailed)} failed
                </span>
              </>
            ) : null}
          </span>
          <span>
            Fees paid: <span className="text-slate-300 font-semibold">{fmtMoney(game.stats.contractRevenue)}</span>
          </span>
        </div>
      )}

      {game.log.length === 0 ? (
        <p className="text-sm text-slate-500">The log is blank so far.</p>
      ) : (
        <ol className="relative border-l border-slate-700/70 ml-2 space-y-4">
          {game.log.map((entry, i) => (
            <li key={`${entry.day}-${i}`} className="ml-5 relative">
              <span className="absolute -left-[27px] top-0 w-2.5 h-2.5 rounded-full bg-indigo-400 ring-4 ring-indigo-400/20" />
              <div className="text-xs text-slate-500">
                Day {fmt(entry.day)}
              </div>
              <div className="text-sm text-slate-200">
                <span className="mr-1.5">{entry.icon}</span>
                {entry.text}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}