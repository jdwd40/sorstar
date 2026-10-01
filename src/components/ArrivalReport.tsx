import { useMemo } from 'react'
import type { GameState } from '../types/game'
import { PLANET_MAP, PLANET_TYPE_META } from '../data/gameData'
import { carriedGoods } from '../services/gameService'
import { getTradeLeads } from '../services/intelService'
import { fmt, fmtMoney } from '../utils/format'
import Modal from './Modal'
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
 */
export default function ArrivalReport({ game, info, note, onClose }: ArrivalReportProps) {
  const dest = PLANET_MAP[info.toId ?? game.planetId]
  const goods = useMemo(() => carriedGoods(game).slice(0, 5), [game])
  const leads = useMemo(
    () => (game.ship.navLevel >= 1 ? getTradeLeads(game).slice(0, 3) : []),
    [game],
  )
  const meta = PLANET_TYPE_META[dest?.type ?? 'frontier']

  return (
    <Modal onClose={onClose} labelledBy="arrival-title">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-4xl">{dest?.icon}</span>
        <div>
          <h2 id="arrival-title" className="text-2xl font-bold text-white">
            Arrived at {dest?.name}
          </h2>
          <p className="text-sm text-slate-400">
            {info.distanceLy} ly · {fmtMoney(info.fuelCost ?? 0)} fuel · day{' '}
            {fmt(info.arriveDay ?? game.day)}
            {dest && (
              <span className={`ml-2 ${meta.color}`}>
                {meta.icon} {dest.type}
              </span>
            )}
          </p>
        </div>
      </div>

      {note && (
        <div className="mb-4 p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 text-sm text-slate-200">
          {note}
        </div>
      )}

      {goods.length > 0 && (
        <div className="mb-4">
          <h3
            className="text-sm uppercase tracking-wider text-slate-400 mb-2"
            title="What the Trade tab would credit you for each line if you sold it here now - the market absorbs your order as you sell, so this sits below Qty x listed price."
          >
            Your hold if sold here
          </h3>
          <div className="space-y-1">
            {goods.map(({ commodity, qty, costBasis, sellsFor }) => {
              const perUnit = sellsFor / qty - costBasis
              return (
                <div key={commodity.id} className="flex items-center justify-between text-sm">
                  <span className="text-white">
                    {commodity.icon} {commodity.name}
                    <span className="text-slate-500"> ×{fmt(qty)}</span>
                  </span>
                  <span
                    className={
                      perUnit >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'
                    }
                  >
                    {perUnit >= 0 ? '+' : ''}
                    {fmtMoney(perUnit)}/unit · {fmtMoney(sellsFor)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {leads.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-2">
            🛰️ Best runs from here
          </h3>
          <div className="space-y-1">
            {leads.map((lead) => (
              <div key={lead.commodityId} className="flex items-center justify-between text-sm">
                <span className="text-white">
                  {lead.icon} {lead.commodityName}
                  <span className="text-slate-500"> → {lead.targetPlanetName}</span>
                </span>
                <span className="text-emerald-400 font-semibold">+{fmtMoney(lead.runProfit)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onClose} className="btn-primary w-full">
        Dock & look around
      </button>
    </Modal>
  )
}