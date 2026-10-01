import { useMemo } from 'react'
import type { GameState } from '../types/game'
import { COMMODITY_MAP, PLANET_MAP } from '../data/gameData'
import { carriedGoods } from '../services/gameService'
import { getTradeLeads } from '../services/intelService'
import { activeContracts } from '../services/contractService'
import { fmt, fmtMoney } from '../utils/format'
import Modal from './Modal'
import PlanetVisual from './ui/PlanetVisual'
import { planetStyle } from './ui/planetStyle'
import GameBadge from './ui/GameBadge'
import MarketAlert from './ui/MarketAlert'
import { StatTile } from './ui/StatusChip'
import { IconCheck, IconPlanetType, IconScroll, IconWarning } from './ui/Icons'
import type { TravelResult } from '../services/travelService'

interface ArrivalReportProps {
  game: GameState
  info: TravelResult
  /**
   * What an encounter did on the way here, when the journey was interrupted.
   * Shown above the hold because it is the reason the trip cost what it did.
   */
  note?: string
  onClose: () => void
}

/**
 * What the player gets when a jump ends.
 *
 * Lives outside `TravelPanel` because an interrupted journey ends its flight in
 * two pieces - the encounter, then the arrival - and the two can be a long way
 * apart on screen. Whatever the player was looking at when the jump began, this
 * is what they are shown when the ship docks.
 *
 * It answers, in order: where am I, what did the trip cost, what happened on the
 * way, what is my hold worth here, what is going on in this market, and which of
 * my contracts can I hand over. Everything below the header is shown only when
 * it has something to say.
 */
export default function ArrivalReport({ game, info, note, onClose }: ArrivalReportProps) {
  const dest = PLANET_MAP[info.toId ?? game.planetId]
  const goods = useMemo(() => carriedGoods(game), [game])
  const leads = useMemo(
    () => (game.ship.navLevel >= 1 ? getTradeLeads(game).slice(0, 3) : []),
    [game],
  )
  const holdValue = goods.reduce((sum, good) => sum + good.sellsFor, 0)
  const holdProfit = goods.reduce((sum, good) => sum + good.sellsFor - good.breakEven, 0)
  const deliveries = activeContracts(game).filter((c) => c.destinationPlanetId === dest?.id)
  const rim = planetStyle(dest).rim

  return (
    <Modal onClose={onClose} labelledBy="arrival-title">
      {/* The world, big, with its own light behind it. */}
      <div className="relative -mx-6 -mt-6 mb-4 overflow-hidden px-6 pb-2 pt-6 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 70% 80% at 50% 40%, ${rim}33 0%, transparent 70%)`,
          }}
          aria-hidden="true"
        />
        <PlanetVisual planet={dest} size="xl" label={dest?.name} className="relative my-2" />
        <div className="relative mt-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-300/90">
          Arrived
        </div>
        <h2 id="arrival-title" className="relative text-2xl font-black tracking-wide text-white">
          {dest?.name}
        </h2>
        {dest && (
          <div className="relative mt-1 flex justify-center">
            <GameBadge tone="info" title={`${dest.type} world`}>
              <IconPlanetType type={dest.type} className="h-3 w-3" />
              {dest.type}
            </GameBadge>
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatTile
          label="Flight"
          value={`${fmt(info.days ?? info.distanceLy ?? 0)} d`}
          hint={`${fmt(info.distanceLy ?? 0)} ly`}
        />
        <StatTile label="Fuel" value={fmtMoney(info.fuelCost ?? 0)} tone="text-amber-200" />
        <StatTile label="Day" value={fmt(info.arriveDay ?? game.day)} />
      </div>

      {note && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <IconWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/90">
              In transit
            </div>
            {note}
          </div>
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {deliveries.map((contract) => {
            const short = Math.max(0, contract.quantity - (game.cargo[contract.commodityId] ?? 0))
            const commodity = COMMODITY_MAP[contract.commodityId]
            return (
              <div
                key={contract.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                  short === 0
                    ? 'ready-glow border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                    : 'border-violet-400/30 bg-violet-500/10 text-violet-100'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {short === 0 ? (
                    <IconCheck className="h-4 w-4 shrink-0 text-emerald-300" />
                  ) : (
                    <IconScroll className="h-4 w-4 shrink-0 text-violet-300" />
                  )}
                  <span className="truncate">
                    {short === 0 ? 'Delivery ready' : `${fmt(short)} short`} ·{' '}
                    <span aria-hidden="true">{commodity?.icon}</span> {fmt(contract.quantity)}{' '}
                    {commodity?.name}
                  </span>
                </span>
                <span className="num shrink-0 font-bold">{fmtMoney(contract.reward)}</span>
              </div>
            )
          })}
        </div>
      )}

      <MarketAlert game={game} planet={dest ?? PLANET_MAP[game.planetId]} className="mb-4" />

      {goods.length > 0 && (
        <div className="mb-4">
          <div
            className="mb-2 flex items-baseline justify-between gap-3"
            title="What the Trade tab would credit you for each line if you sold it here now - the market absorbs your order as you sell, so this sits below Qty x listed price."
          >
            <h3 className="panel-heading">Your hold sells here for</h3>
            <span className="num text-right">
              <span className="text-lg font-bold text-cyan-100">{fmtMoney(holdValue)}</span>{' '}
              <span
                className={`text-sm font-semibold ${holdProfit >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}
              >
                {holdProfit >= 0 ? '+' : '-'}
                {fmtMoney(Math.abs(holdProfit))}
              </span>
            </span>
          </div>
          <div className="space-y-1">
            {goods.slice(0, 5).map(({ commodity, qty, costBasis, sellsFor }) => {
              const perUnit = sellsFor / qty - costBasis
              return (
                <div
                  key={commodity.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/50 px-2.5 py-1.5 text-sm"
                >
                  <span className="text-white">
                    <span aria-hidden="true">{commodity.icon}</span> {commodity.name}
                    <span className="num text-slate-500"> ×{fmt(qty)}</span>
                  </span>
                  <span className="num text-right">
                    <span
                      className={`font-semibold ${perUnit >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}
                    >
                      {perUnit >= 0 ? '+' : '-'}
                      {fmtMoney(Math.abs(perUnit))}/u
                    </span>
                    <span className="ml-2 text-[11px] text-slate-500">{fmtMoney(sellsFor)}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {leads.length > 0 && (
        <div className="mb-4">
          <h3 className="panel-heading mb-2">Best runs from here</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {leads.map((lead) => (
              <StatTile
                key={lead.commodityId}
                label={`${lead.icon} ${lead.commodityName} → ${lead.targetPlanetName}`}
                value={`+${fmtMoney(lead.runProfit)}`}
                hint={`load ${fmt(lead.runQty)} · ${lead.travelDays}d`}
                tone="text-emerald-300"
              />
            ))}
          </div>
        </div>
      )}

      <button onClick={onClose} className="btn-primary w-full py-2.5">
        Dock &amp; trade
      </button>
    </Modal>
  )
}
