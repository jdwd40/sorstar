import type { GameState, ShipUpgradeType } from '../types/game'
import {
  UPGRADE_META,
  cargoCapacityAtLevel,
  dailyUpkeep,
  fuelCostAtLevel,
} from '../data/gameData'
import { isMaxUpgrade, nextUpgradeCost } from '../services/playerService'
import { carriedGoods, netWorth } from '../services/gameService'
import { cargoFree, cargoUsed } from '../services/marketService'
import { fmt, fmtMoney } from '../utils/format'
import type { ActionResult } from '../context/GameContext'

interface ShipPanelProps {
  game: GameState
  travelUpgrade: (type: ShipUpgradeType) => ActionResult
  resetGame: () => void
}

interface UpgradeRowProps {
  game: GameState
  type: ShipUpgradeType
  travelUpgrade: ShipPanelProps['travelUpgrade']
}

function UpgradeCard({ game, type, travelUpgrade }: UpgradeRowProps) {
  const meta = UPGRADE_META[type]
  const maxed = isMaxUpgrade(game, type)
  const cost = maxed ? 0 : nextUpgradeCost(game, type)
  const affordable = cost > 0 && cost <= game.credits

  let current: string
  let next: string
  let level: number
  switch (type) {
    case 'cargo':
      level = game.ship.cargoLevel
      current = `${cargoCapacityAtLevel(game.ship.cargoLevel)} units`
      next = maxed ? 'MAX' : `${cargoCapacityAtLevel(game.ship.cargoLevel + 1)} units`
      break
    case 'engine':
      level = game.ship.engineLevel
      current = `${fuelCostAtLevel(game.ship.engineLevel)} cr/ly`
      next = maxed ? 'MAX' : `${fuelCostAtLevel(game.ship.engineLevel + 1)} cr/ly`
      break
    case 'nav':
      level = game.ship.navLevel
      current = game.ship.navLevel >= 1 ? 'Online' : 'Offline'
      next = maxed ? 'MAX' : 'Online'
      break
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.icon}</span>
          <div>
            <h3 className="font-bold text-white">{meta.name}</h3>
            <p className="text-xs text-slate-400">{meta.description}</p>
          </div>
        </div>
        <span className="text-sm text-slate-400">
          Lv<span className="text-white font-bold">{level}</span>
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400">
          Current: <span className="text-white font-semibold">{current}</span>
          <span className="mx-2 text-slate-600">→</span>
          Next: <span className="text-indigo-300 font-semibold">{next}</span>
        </div>
        <button
          onClick={() => travelUpgrade(type)}
          disabled={maxed || !affordable}
          title={
            maxed
              ? 'Fully upgraded'
              : affordable
                ? `${meta.name} costs ${fmtMoney(cost)}`
                : `Need ${fmtMoney(cost)} credits`
          }
          className={`btn-primary text-sm ${maxed ? '!bg-slate-700 !text-slate-300' : ''}`}
        >
          {maxed ? 'Maxed' : `Upgrade · ${fmtMoney(cost)}`}
        </button>
      </div>
    </div>
  )
}

export default function ShipPanel({ game, travelUpgrade, resetGame }: ShipPanelProps) {
  const used = cargoUsed(game)
  const free = cargoFree(game)
  const invested = game.stats.upgradesInvested
  const goods = carriedGoods(game)
  const sellsFor = goods.reduce((sum, g) => sum + g.sellsFor, 0)
  const holdProfit = goods.reduce((sum, g) => sum + g.sellsFor - g.breakEven, 0)
  const nw = netWorth(game)

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🛸</span>
            <div>
              <h2 className="text-2xl font-bold text-white">
                {game.ship.name}
                <span className="ml-3 text-sm font-normal text-slate-400">
                  {game.ship.className}
                </span>
              </h2>
              <p className="text-sm text-slate-400">
                Your trusty merchant freighter. Net worth {fmtMoney(nw)}.
              </p>
            </div>
          </div>
          <div className="text-sm text-slate-300">
            Total invested in upgrades:{' '}
            <span className="text-indigo-300 font-bold">{fmtMoney(invested)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <div className="text-xs uppercase tracking-wider text-slate-400">Cargo</div>
            <div className="text-lg font-bold text-white">
              {fmt(used)}/{fmt(cargoCapacityAtLevel(game.ship.cargoLevel))}
            </div>
            <div className="text-xs text-slate-500">{free} free</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <div className="text-xs uppercase tracking-wider text-slate-400">Engine</div>
            <div className="text-lg font-bold text-white">
              {fuelCostAtLevel(game.ship.engineLevel)} cr/ly
            </div>
            <div className="text-xs text-slate-500">fuel burn</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <div className="text-xs uppercase tracking-wider text-slate-400">Nav Array</div>
            <div className="text-lg font-bold text-white">
              {game.ship.navLevel >= 1 ? 'Online' : 'Offline'}
            </div>
            <div className="text-xs text-slate-500">
              {game.ship.navLevel >= 1 ? 'market intel active' : 'install to see runs'}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <div className="text-xs uppercase tracking-wider text-slate-400">Upkeep</div>
            <div className="text-lg font-bold text-white">{dailyUpkeep(game.ship)} cr</div>
            <div className="text-xs text-slate-500">
              per day waited · {fmt(game.stats.tripsMade)} trips
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-indigo-300 mb-3">Upgrades</h3>
        <div className="space-y-4">
          {(['cargo', 'engine', 'nav'] as ShipUpgradeType[]).map((type) => (
            <div key={type}><UpgradeCard game={game} type={type} travelUpgrade={travelUpgrade} /></div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-white">Cargo Hold</h3>
          {sellsFor > 0 && (
            <div
              className="text-sm text-slate-400"
              title="What selling the whole hold here would credit. It already allows for the market moving under your own order, so it is less than Qty x Price Here."
            >
              Sells here:{' '}
              <span className="text-cyan-300 font-bold">{fmtMoney(sellsFor)}</span>
              <span className={`ml-2 ${holdProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {holdProfit >= 0 ? '+' : ''}{fmtMoney(holdProfit)}
              </span>
              <span className="text-xs text-slate-500"> vs what you paid</span>
            </div>
          )}
        </div>
        {goods.length === 0 ? (
          <div className="border border-dashed border-slate-700 rounded-lg p-6 text-center text-sm text-slate-500">
            Your hold is empty. Head to the Trade tab and pick up cargo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="py-2 pr-4">Good</th>
                  <th className="py-2 pr-4 text-right">Qty</th>
                  <th className="py-2 pr-4 text-right">Your Cost</th>
                  <th
                    className="py-2 pr-4 text-right"
                    title="The listed price per unit. Your own sale pushes it down as you sell."
                  >
                    Price Here
                  </th>
                  <th className="py-2 pr-4 text-right">Per-unit</th>
                  <th
                    className="py-2 text-right"
                    title="What selling this line here pays, after the market absorbs your order."
                  >
                    Sells For
                  </th>
                </tr>
              </thead>
              <tbody>
                {goods.map(({ commodity, qty, costBasis, herePrice, sellsFor }) => {
                  // Averaged over the fill, not over the listed price: the
                  // per-unit profit has to be the profit the sale really makes.
                  const perUnit = sellsFor / qty - costBasis
                  return (
                    <tr key={commodity.id} className="border-b border-slate-800/60">
                      <td className="py-2 pr-4">
                        <span className="text-lg mr-1.5">{commodity.icon}</span>
                        <span className="text-white font-medium">{commodity.name}</span>
                      </td>
                      <td className="py-2 pr-4 text-right text-white font-semibold">{fmt(qty)}</td>
                      <td className="py-2 pr-4 text-right text-slate-300">{fmtMoney(costBasis)}</td>
                      <td className="py-2 pr-4 text-right text-slate-300">{fmtMoney(herePrice)}</td>
                      <td
                        className={`py-2 pr-4 text-right font-semibold ${perUnit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      >
                        {perUnit >= 0 ? '+' : ''}{fmtMoney(perUnit)}
                      </td>
                      <td className="py-2 text-right text-cyan-300 font-bold">{fmtMoney(sellsFor)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-center">
        <button
          onClick={() => resetGame()}
          className="text-red-400/80 hover:text-red-300 text-sm underline underline-offset-2"
        >
          Reset Game
        </button>
      </div>
    </div>
  )
}