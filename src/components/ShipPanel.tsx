import type { GameState, ShipUpgradeType } from '../types/game'
import {
  CARGO_UPGRADES,
  ENGINE_UPGRADES,
  NAV_UPGRADES,
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
import { StatTile } from './ui/StatusChip'
import GameBadge from './ui/GameBadge'
import { IconShip } from './ui/Icons'

interface ShipPanelProps {
  game: GameState
  travelUpgrade: (type: ShipUpgradeType) => ActionResult
  resetGame: () => void
}

/** How many tiers the ladder has, so the card can show progress along it. */
function tierCount(type: ShipUpgradeType): number {
  switch (type) {
    case 'cargo':
      return CARGO_UPGRADES.length
    case 'engine':
      return ENGINE_UPGRADES.length
    case 'nav':
      return NAV_UPGRADES.length
  }
}

function UpgradeCard({
  game,
  type,
  travelUpgrade,
}: {
  game: GameState
  type: ShipUpgradeType
  travelUpgrade: ShipPanelProps['travelUpgrade']
}) {
  const meta = UPGRADE_META[type]
  const maxed = isMaxUpgrade(game, type)
  const cost = maxed ? 0 : nextUpgradeCost(game, type)
  const affordable = cost > 0 && cost <= game.credits
  const level =
    type === 'cargo' ? game.ship.cargoLevel : type === 'engine' ? game.ship.engineLevel : game.ship.navLevel
  const tiers = tierCount(type)

  let current: string
  let next: string
  switch (type) {
    case 'cargo':
      current = `${cargoCapacityAtLevel(game.ship.cargoLevel)} units`
      next = maxed ? 'MAX' : `${cargoCapacityAtLevel(game.ship.cargoLevel + 1)} units`
      break
    case 'engine':
      current = `${fuelCostAtLevel(game.ship.engineLevel)} cr/ly`
      next = maxed ? 'MAX' : `${fuelCostAtLevel(game.ship.engineLevel + 1)} cr/ly`
      break
    case 'nav':
      current = game.ship.navLevel >= 1 ? 'Online' : 'Offline'
      next = maxed ? 'MAX' : 'Online'
      break
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            {meta.icon}
          </span>
          <div>
            <h3 className="font-bold text-white">{meta.name}</h3>
            <p className="text-xs text-slate-400">{meta.description}</p>
          </div>
        </div>
        <GameBadge tone={maxed ? 'good' : 'info'} title={`Tier ${level} of ${tiers}`}>
          Lv {level}
          {maxed ? ' · max' : ` / ${tiers}`}
        </GameBadge>
      </div>

      {/* Progress along the upgrade ladder, tier by tier. */}
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: tiers }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < level ? 'bg-gradient-to-r from-indigo-400 to-cyan-300' : 'bg-slate-700/70'
            }`}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="num text-xs text-slate-400">
          Current: <span className="font-semibold text-white">{current}</span>
          <span className="mx-2 text-slate-600">→</span>
          Next: <span className="font-semibold text-indigo-300">{next}</span>
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
          className={`btn-primary btn-sm ${maxed ? '!bg-slate-700 !text-slate-300' : ''}`}
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
  const capacity = cargoCapacityAtLevel(game.ship.cargoLevel)
  const invested = game.stats.upgradesInvested
  const goods = carriedGoods(game)
  const sellsFor = goods.reduce((sum, g) => sum + g.sellsFor, 0)
  const holdProfit = goods.reduce((sum, g) => sum + g.sellsFor - g.breakEven, 0)
  const nw = netWorth(game)

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconShip className="h-8 w-8 text-indigo-300" />
            <div>
              <h2 className="flex flex-wrap items-baseline gap-2 text-xl font-bold text-white">
                {game.ship.name}
                <span className="text-sm font-normal text-slate-400">{game.ship.className}</span>
              </h2>
              <p className="num text-sm text-slate-400">
                Your trusty merchant freighter. Net worth{' '}
                <span className="font-semibold text-indigo-200">{fmtMoney(nw)}</span>.
              </p>
            </div>
          </div>
          <div className="num text-xs text-slate-400">
            Invested in upgrades{' '}
            <span className="text-sm font-bold text-indigo-300">{fmtMoney(invested)}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Cargo"
            value={`${fmt(used)}/${fmt(capacity)}`}
            tone={free === 0 ? 'text-rose-300' : 'text-white'}
            hint={`${fmt(free)} bays free`}
          />
          <StatTile
            label="Engine"
            value={`${fuelCostAtLevel(game.ship.engineLevel)}`}
            hint="cr per light year"
          />
          <StatTile
            label="Nav array"
            value={game.ship.navLevel >= 1 ? 'Online' : 'Offline'}
            tone={game.ship.navLevel >= 1 ? 'text-emerald-300' : 'text-slate-300'}
            hint={game.ship.navLevel >= 1 ? 'market intel active' : 'install to see runs'}
          />
          <StatTile
            label="Upkeep"
            value={`${fmtMoney(dailyUpkeep(game.ship))}`}
            hint={`cr/day · ${fmt(game.stats.tripsMade)} trips`}
          />
        </div>

        <div className="mt-3" aria-hidden="true">
          <div className="meter">
            <div
              className={`meter-fill bg-gradient-to-r ${
                free === 0
                  ? 'from-rose-400 to-amber-300'
                  : used / capacity > 0.75
                    ? 'from-amber-400 to-yellow-300'
                    : 'from-cyan-400 to-indigo-400'
              }`}
              style={{ width: `${Math.min(100, (used / Math.max(1, capacity)) * 100)}%` }}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="panel-heading mb-2 text-indigo-300/90">Upgrades</h3>
        <div className="space-y-3">
          {(['cargo', 'engine', 'nav'] as ShipUpgradeType[]).map((type) => (
            <UpgradeCard key={type} game={game} type={type} travelUpgrade={travelUpgrade} />
          ))}
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-white">Cargo hold</h3>
          {sellsFor > 0 && (
            <div
              className="num text-sm text-slate-400"
              title="What selling the whole hold here would credit. It already allows for the market moving under your own order, so it is less than Qty x Price Here."
            >
              Sells here:{' '}
              <span className="font-bold text-cyan-200">{fmtMoney(sellsFor)}</span>
              <span className={`ml-2 ${holdProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {holdProfit >= 0 ? '+' : ''}
                {fmtMoney(holdProfit)}
              </span>
              <span className="text-xs text-slate-500">vs what you paid</span>
            </div>
          )}
        </div>
        {goods.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
            Your hold is empty. Head to the Trade tab and pick up cargo.
          </div>
        ) : (
          <div className="table-wrap -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="table-head">
                  <th className="th">Good</th>
                  <th className="th text-right">Qty</th>
                  <th className="th text-right">Your cost</th>
                  <th
                    className="th text-right"
                    title="The listed price per unit. Your own sale pushes it down as you sell."
                  >
                    Price here
                  </th>
                  <th className="th text-right">Per-unit</th>
                  <th
                    className="th text-right"
                    title="What selling this line here pays, after the market absorbs your order."
                  >
                    Sells for
                  </th>
                </tr>
              </thead>
              <tbody>
                {goods.map(({ commodity, qty, costBasis, herePrice, sellsFor }) => {
                  // Averaged over the fill, not over the listed price: the
                  // per-unit profit has to be the profit the sale really makes.
                  const perUnit = sellsFor / qty - costBasis
                  return (
                    <tr key={commodity.id} className="row row-hover">
                      <td className="td">
                        <span className="mr-1.5 text-lg" aria-hidden="true">
                          {commodity.icon}
                        </span>
                        <span className="font-medium text-white">{commodity.name}</span>
                      </td>
                      <td className="td num text-right font-semibold text-white">{fmt(qty)}</td>
                      <td className="td num text-right text-slate-300">{fmtMoney(costBasis)}</td>
                      <td className="td num text-right text-slate-300">{fmtMoney(herePrice)}</td>
                      <td
                        className={`td num text-right font-semibold ${
                          perUnit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {perUnit >= 0 ? '+' : ''}
                        {fmtMoney(perUnit)}
                      </td>
                      <td className="td num text-right font-bold text-cyan-200">
                        {fmtMoney(sellsFor)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="text-center">
        <button
          onClick={() => resetGame()}
          className="text-sm text-rose-300/80 underline underline-offset-2 hover:text-rose-200"
        >
          Reset Game
        </button>
      </div>
    </div>
  )
}