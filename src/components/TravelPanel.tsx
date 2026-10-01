import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameState, Planet } from '../types/game'
import { PLANET_MAP, PLANETS, distanceBetween, fuelCostAtLevel } from '../data/gameData'
import { canTravel, travelCost } from '../services/travelService'
import { getTradeLeads } from '../services/intelService'
import {
  describeEventMoves,
  eventDaysRemaining,
  eventDefinition,
  sectorEvents,
} from '../services/marketEventService'
import { contractDests } from '../services/contractService'
import { fmt, fmtMoney } from '../utils/format'
import { sound } from '../utils/sound'
import Modal from './Modal'
import type { ActionResult } from '../context/GameContext'
import type { TravelResult } from '../services/travelService'
import SectorMap, { type SectorRoute } from './ui/SectorMap'
import PlanetVisual from './ui/PlanetVisual'
import GameBadge from './ui/GameBadge'
import { StatTile } from './ui/StatusChip'
import { IconBlocked, IconPlanetType, IconTravel, IconWarning } from './ui/Icons'

interface TravelPanelProps {
  game: GameState
  travel: (destId: string) => ActionResult
  /**
   * Hands the arrival report up to the page.
   *
   * A jump that ran into something ends in two pieces, so the report cannot
   * belong to this tab: an encounter resolved from wherever the player is
   * standing still has to show it.
   */
  onArrival: (info: TravelResult) => void
}

type Phase = 'idle' | 'charging' | 'jumping'

export default function TravelPanel({ game, travel, onArrival }: TravelPanelProps) {
  const current = PLANET_MAP[game.planetId]
  const fuelPerLy = fuelCostAtLevel(game.ship.engineLevel)
  const [confirmDest, setConfirmDest] = useState<Planet | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [jumpTo, setJumpTo] = useState<Planet | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warpTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      warpTimersRef.current.forEach(clearTimeout)
    }
  }, [])

  const destinations = useMemo(() => {
    return PLANETS.filter((p) => p.id !== game.planetId).map((planet) => {
      const cost = travelCost(game, planet.id)
      const check = canTravel(game, planet.id)
      const ly = distanceBetween(current, planet)
      return { planet, cost, ly, check }
    })
  }, [game, current])

  /**
   * What the chart needs for every world, including this one: the distance and
   * the fuel, and why a hop is closed if it is. All of it is already public -
   * the table below says exactly the same things.
   */
  const routes = useMemo(() => {
    const map = new Map<string, SectorRoute>()
    map.set(current.id, { ly: 0, cost: 0, blocked: null })
    for (const { planet, cost, ly, check } of destinations) {
      map.set(planet.id, { ly, cost, blocked: check.ok ? null : (check.reason ?? null) })
    }
    return map
  }, [destinations, current])

  const intel = useMemo(() => {
    if (game.ship.navLevel < 1) return []
    return getTradeLeads(game)
  }, [game])

  // A market disruption at a planet is a mark on the chart even without the
  // Navigation Array: the flag says something is happening, not what.
  const eventPlanets = useMemo(() => {
    const ids = new Set<string>()
    for (const event of sectorEvents(game.activeEvents, game.day)) ids.add(event.planetId)
    return ids
  }, [game])

  const intelEnabled = game.ship.navLevel >= 1
  const sectorAlerts = useMemo(
    () => (intelEnabled ? sectorEvents(game.activeEvents, game.day) : []),
    [game, intelEnabled],
  )
  // Contract deadlines are the player's own commitments, so they are marked on
  // the chart the moment they are accepted - unlike market events, which the
  // Navigation Array gates. A destination the player is already carrying work
  // for is a reason to fly there that no upgrade should hide.
  const dueHere = useMemo(() => contractDests(game), [game])

  const requestTravel = (planet: Planet) => {
    if (phase !== 'idle') return
    const check = canTravel(game, planet.id)
    if (!check.ok) {
      setMapError(check.reason ?? 'Cannot travel there.')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setMapError(null), 3200)
      return
    }
    setMapError(null)
    setConfirmDest(planet)
  }

  const executeTravel = () => {
    if (!confirmDest) return
    const dest = confirmDest
    setConfirmDest(null)
    setJumpTo(dest)
    setPhase('charging')
    sound.travel()
    warpTimersRef.current.forEach(clearTimeout)
    warpTimersRef.current = [
      window.setTimeout(() => setPhase('jumping'), 450),
      window.setTimeout(() => {
        const res = travel(dest.id)
        if (!res.ok) {
          setPhase('idle')
          setJumpTo(null)
          setMapError(res.message)
          return
        }
        setPhase('idle')
        setJumpTo(null)
        // Interrupted jumps report nothing: the encounter modal is what the
        // player is looking at now, and the arrival comes after it.
        if (res.info) onArrival(res.info)
      }, 1300),
    ]
  }

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="panel-heading text-indigo-300/90">
            Travel
            <span className="ml-2 normal-case tracking-normal text-slate-400">
              from {current.name}
            </span>
          </h2>
          <span className="text-[11px] text-slate-500">
            Engine <span className="num text-slate-300">{fuelPerLy}</span> cr / ly
          </span>
        </div>

        <SectorMap
          current={current}
          routes={routes}
          eventPlanets={eventPlanets}
          dueHere={dueHere}
          busy={phase !== 'idle'}
          onSelect={requestTravel}
        />

        {mapError && (
          <div
            className="toast-in mt-3 flex items-center gap-2 rounded-lg border border-rose-700/50 bg-rose-950/60 p-3 text-sm text-rose-200"
            role="alert"
          >
            <IconBlocked className="h-4 w-4 shrink-0" />
            {mapError}
          </div>
        )}

        <div className="table-wrap mt-4 -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="table-head">
                <th className="th">Destination</th>
                <th className="th text-right">Distance</th>
                <th className="th text-right">Fuel cost</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {destinations.map(({ planet, cost, ly, check }) => {
                const due = dueHere.get(planet.id) ?? 0
                return (
                  <tr key={planet.id} className="row row-hover">
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <PlanetVisual planet={planet} size="xs" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-white">{planet.name}</span>
                            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                              <IconPlanetType type={planet.type} className="h-3 w-3" />
                              {planet.type}
                            </span>
                            {eventPlanets.has(planet.id) && (
                              <GameBadge tone="warn" title="A market event is running here">
                                <IconWarning className="h-3 w-3" />
                                event
                              </GameBadge>
                            )}
                            {due > 0 && (
                              <GameBadge
                                tone="contract"
                                title={`${due} contract${due > 1 ? 's' : ''} to deliver here`}
                              >
                                {due} due
                              </GameBadge>
                            )}
                          </div>
                          <div className="hidden max-w-[20rem] truncate text-xs text-slate-500 sm:block">
                            {planet.description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="td num text-right text-slate-300">{fmt(ly)} ly</td>
                    <td className="td num text-right font-semibold text-white">{fmtMoney(cost)}</td>
                    <td className="td text-right">
                      <button
                        onClick={() => requestTravel(planet)}
                        disabled={!check.ok || phase !== 'idle'}
                        title={check.reason}
                        className="btn-primary btn-sm"
                      >
                        Travel
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="panel-heading text-indigo-300/90">Market intelligence</h3>
          {!intelEnabled && (
            <span className="text-[11px] text-slate-500">
              Install the Navigation Array (Ship tab) to unlock trade leads.
            </span>
          )}
        </div>

        {!intelEnabled ? (
          <p className="text-sm text-slate-400">
            Without a Navigation Array your astrogation charts only plot routes, not
            prices. Upgrade your ship to see the best buy-to-sell runs.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Sector-wide, and only with the array: the flag on the chart is the
                un-upgraded player's only warning that a market is off-normal, and
                it deliberately says nothing about which good or by how much. */}
            {sectorAlerts.length > 0 && (
              <div>
                <h4 className="panel-heading mb-2 text-amber-300/90">Sector market alerts</h4>
                <div className="space-y-1.5">
                  {sectorAlerts.map((event) => {
                    const days = eventDaysRemaining(event, game.day)
                    return (
                      <div
                        key={event.id}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-2 text-sm"
                      >
                        <span className="text-white">
                          {PLANET_MAP[event.planetId]?.name ?? event.planetId}
                          <span className="mx-1.5 text-slate-600">—</span>
                          {eventDefinition(event)?.name ?? event.eventType}
                        </span>
                        <span className="num whitespace-nowrap text-slate-300">
                          {describeEventMoves(event)}
                          <span className="text-slate-500">
                            {' '}
                            · {days} day{days === 1 ? '' : 's'}
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {intel.length === 0 ? (
              <p className="text-sm text-slate-400">
                No profitable runs detected from this planet right now. Try a different
                market or wait a day for prices to shift.
              </p>
            ) : (
              <div className="table-wrap -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="table-head">
                      <th className="th">Good</th>
                      <th className="th">Buy here</th>
                      <th
                        className="th"
                        title="A forecast range, not a quote. The destination re-prices while you are in transit and you cannot see where it opens."
                      >
                        Sell at (est.)
                      </th>
                      <th className="th text-right">Spread</th>
                      <th className="th text-right">Expected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intel.map((lead) => (
                      <tr key={lead.commodityId} className="row row-hover">
                        <td className="td">
                          <span className="font-medium text-white">
                            <span aria-hidden="true">{lead.icon}</span> {lead.commodityName}
                          </span>
                          {lead.holding > 0 && (
                            <span className="num ml-2 text-xs text-cyan-300">
                              holding {fmt(lead.holding)}
                            </span>
                          )}
                        </td>
                        <td className="td text-emerald-300">
                          {lead.originPlanetName}
                          <div className="num text-xs text-slate-400">
                            {fmtMoney(lead.originPrice)}
                          </div>
                        </td>
                        <td className="td text-amber-300">
                          {lead.targetPlanetName}
                          <div className="num text-xs text-slate-400">
                            {fmtMoney(lead.sellPriceLow)}–{fmtMoney(lead.sellPriceHigh)}
                          </div>
                        </td>
                        <td className="td num text-right font-semibold text-white">
                          +{fmtMoney(lead.spread)}
                        </td>
                        <td className="td text-right">
                          <span
                            className="num font-semibold text-emerald-300"
                            title="Expected profit: the arrival price is a forecast, so this is a fair average over where the market could open."
                          >
                            +{fmtMoney(lead.runProfit)}
                          </span>
                          <div className="num text-[10px] text-slate-500">
                            load {fmt(lead.runQty)} · arrives in {lead.travelDays} day
                            {lead.travelDays > 1 ? 's' : ''}
                          </div>
                          {/* The downside is stated, not buried: a lead can still
                              land in the red if the market opens against you. */}
                          <div
                            className={`num text-[10px] ${
                              lead.worstCase < 0 ? 'text-rose-300/80' : 'text-slate-500'
                            }`}
                          >
                            worst case {fmtMoney(lead.worstCase)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {confirmDest && (
        <Modal onClose={() => setConfirmDest(null)} labelledBy="confirm-jump-title">
          <div className="mb-4 flex items-center gap-3">
            <PlanetVisual planet={confirmDest} size="lg" label={confirmDest.name} />
            <div>
              <h2 id="confirm-jump-title" className="text-xl font-bold text-white">
                Plot course to {confirmDest.name}?
              </h2>
              <p className="text-sm text-slate-400">{confirmDest.description}</p>
            </div>
          </div>
          <div className="mb-5 grid grid-cols-3 gap-2">
            <StatTile
              label="Distance"
              value={`${fmt(distanceBetween(current, confirmDest))} ly`}
            />
            <StatTile
              label="Fuel"
              value={fmtMoney(travelCost(game, confirmDest.id))}
              tone="text-amber-200"
            />
            <StatTile
              label="Jump time"
              value={`${fmt(distanceBetween(current, confirmDest))} d`}
              hint="one day per light year"
            />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setConfirmDest(null)} className="btn-ghost flex-1">
              Cancel
            </button>
            <button onClick={executeTravel} className="btn-primary flex flex-1 items-center justify-center gap-2">
              <IconTravel className="h-4 w-4" />
              Launch
            </button>
          </div>
        </Modal>
      )}

      {phase !== 'idle' && jumpTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-indigo-950/90 modal-fade" />
          <div className="absolute inset-0 warp-field" />
          <div className="absolute top-1/2 h-px w-full warp-flash bg-indigo-300 shadow-[0_0_30px_8px_rgba(129,140,248,0.8)]" />
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="absolute h-16 w-0.5 warp-streak bg-indigo-200"
              style={{
                left: `${6 + i * 7}%`,
                top: `${20 + ((i * 41) % 55)}%`,
                transformOrigin: 'center',
                animationDelay: `${(i % 5) * 0.08}s`,
              }}
            />
          ))}
          <div className="relative text-center text-white">
            <PlanetVisual
              planet={jumpTo}
              size="2xl"
              highlight={phase === 'jumping' ? 'selected' : null}
              className="mx-auto mb-4"
            />
            <div className="text-2xl font-bold tracking-widest text-indigo-100 text-glow">
              {phase === 'charging' ? 'Charging jump drive…' : `Warp to ${jumpTo.name}`}
            </div>
            <div className="num mt-1 text-sm text-indigo-300">
              {fmt(distanceBetween(current, jumpTo))} ly · {fmtMoney(travelCost(game, jumpTo.id))} fuel
            </div>
          </div>
        </div>
      )}
    </div>
  )
}