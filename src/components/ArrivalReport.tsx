import { useMemo } from 'react'
import type { GameState } from '../types/game'
import { PLANET_MAP } from '../data/gameData'
import { carriedGoods } from '../services/gameService'
import { getTradeLeads } from '../services/intelService'
import { fmt, fmtMoney } from '../utils/format'
import Modal from './Modal'
import PlanetVisual from './ui/PlanetVisual'
import GameBadge from './ui/GameBadge'
import { StatTile } from './ui/StatusChip'
import { IconCheck, IconPlanetType, IconTravel } from './ui/Icons'
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
 * It answers, in order: where am I, what did the trip cost, what have I got,
 * and what is worth doing now. The world gets a real identity in the header -
 * this is the one screen where the destination is genuinely new information.
 */
export default function ArrivalReport({ game, info, note, onClose }: ArrivalReportProps) {
  const dest = PLANET_MAP[info.toId ?? game.planetId]
  const goods = useMemo(() => carriedGoods(game).slice(0, 5), [game])
  const leads = useMemo(
    () => (game.ship.navLevel >= 1 ? getTradeLeads(game).slice(0, 3) : []),
    [game],
  )
  const holdValue = goods.reduce((sum, good) => sum + good.sellsFor, 0)

  return (
    <Modal onClose={onClose} labelledBy="arrival-title">
      <div className="mb-4 flex items-center gap-4">
        <PlanetVisual planet={dest} size="xl" label={dest?.name} />
        <div className="min-w-0">
          <h2 id="arrival-title" className="flex flex-wrap items-center gap-2 text-xl font-bold text-white">
            Arrived at {dest?.name}
            {dest && (
              <GameBadge tone="info" title={`${dest.type} world`}>
                <IconPlanetType type={dest.type} className="h-3 w-3" />
                {dest.type}
              </GameBadge>
            )}
          </h2>
          {dest && <p className="mt-0.5 text-sm text-slate-400">{dest.description}</p>}
          <p className="num mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <IconTravel className="h-3 w-3" />
              {fmt(info.distanceLy ?? 0)} ly
            </span>
            <span>{fmtMoney(info.fuelCost ?? 0)} fuel</span>
            <span>day {fmt(info.arriveDay ?? game.day)}</span>
            {dest && <span>pop {dest.population.toLocaleString()}</span>}
          </p>
        </div>
      </div>

      {note && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
          {note}
        </div>
      )}

      {goods.length > 0 && (
        <div className="mb-4">
          <h3
            className="panel-heading mb-2"
            title="What the Trade tab would credit you for each line if you sold it here now - the market absorbs your order as you sell, so this sits below Qty x listed price."
          >
            Your hold if sold here ·{' '}
            <span className="num text-slate-300">{fmtMoney(holdValue)}</span>
          </h3>
          <div className="space-y-1">
            {goods.map(({ commodity, qty, costBasis, sellsFor }) => {
              const perUnit = sellsFor / qty - costBasis
              return (
                <div
                  key={commodity.id}
                  className="row row-hover flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm"
                >
                  <span className="text-white">
                    <span aria-hidden="true">{commodity.icon}</span> {commodity.name}
                    <span className="num text-slate-500"> ×{fmt(qty)}</span>
                  </span>
                  <span className="text-right">
                    <span
                      className={`num block font-semibold ${
                        perUnit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {perUnit >= 0 ? '+' : ''}
                      {fmtMoney(perUnit)}/unit
                    </span>
                    <span className="num block text-[10px] text-slate-500">{fmtMoney(sellsFor)}</span>
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

      <button onClick={onClose} className="btn-primary w-full">
        Dock &amp; look around
      </button>
    </Modal>
  )
}