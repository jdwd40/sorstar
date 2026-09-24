import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameState, Planet } from '../types/game'
import { PLANET_MAP, PLANETS, PLANET_TYPE_META, fuelCostAtLevel } from '../data/gameData'
import { canTravel, distanceBetween, travelCost } from '../services/travelService'
import { getTradeLeads } from '../services/intelService'
import { carriedGoods } from '../services/gameService'
import { fmt, fmtMoney } from '../utils/format'
import { sound } from '../utils/sound'
import Modal from './Modal'
import type { ActionResult } from '../context/GameContext'
import type { TravelResult } from '../services/travelService'

interface TravelPanelProps {
  game: GameState
  travel: (destId: string) => ActionResult
}

type Phase = 'idle' | 'charging' | 'jumping'

function ArrivalReport({
  game,
  info,
  onClose,
}: {
  game: GameState
  info: TravelResult
  onClose: () => void
}) {
  const dest = PLANET_MAP[info.toId ?? game.planetId]
  const goods = useMemo(() => carriedGoods(game).slice(0, 5), [game])
  const leads = useMemo(() => (game.ship.navLevel >= 1 ? getTradeLeads(game).slice(0, 3) : []), [game])
  const meta = PLANET_TYPE_META[dest?.type ?? 'frontier']

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-4xl">{dest?.icon}</span>
        <div>
          <h2 className="text-2xl font-bold text-white">Arrived at {dest?.name}</h2>
          <p className="text-sm text-slate-400">
            {info.distanceLy} ly · {fmtMoney(info.fuelCost ?? 0)} fuel · day {fmt(info.arriveDay ?? game.day)}
            {dest && (
              <span className={`ml-2 ${meta.color}`}>
                {meta.icon} {dest.type}
              </span>
            )}
          </p>
        </div>
      </div>

      {goods.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-2">Your hold at market price</h3>
          <div className="space-y-1">
            {goods.map(({ commodity, qty, herePrice, costBasis, realized }) => {
              const perUnit = herePrice - costBasis
              return (
                <div key={commodity.id} className="flex items-center justify-between text-sm">
                  <span className="text-white">
                    {commodity.icon} {commodity.name}
                    <span className="text-slate-500"> ×{fmt(qty)}</span>
                  </span>
                  <span className={perUnit >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {perUnit >= 0 ? '+' : ''}{fmtMoney(perUnit)}/unit · {fmtMoney(realized)}
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
            🛰️ Best buys from here
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

export default function TravelPanel({ game, travel }: TravelPanelProps) {
  const current = PLANET_MAP[game.planetId]
  const fuelPerLy = fuelCostAtLevel(game.ship.engineLevel)
  const [confirmDest, setConfirmDest] = useState<Planet | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [jumpTo, setJumpTo] = useState<Planet | null>(null)
  const [arrival, setArrival] = useState<TravelResult | null>(null)
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

  const intel = useMemo(() => {
    if (game.ship.navLevel < 1) return []
    return getTradeLeads(game)
  }, [game])

  const intelEnabled = game.ship.navLevel >= 1
  const farthestLy = useMemo(
    () => Math.max(...PLANETS.map((p) => distanceBetween(current, p))),
    [current],
  )

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
        setArrival(res.info ?? null)
      }, 1300),
    ]
  }

  const mapX = (x: number) => `${x}%`
  const mapY = (y: number) => `${y}%`

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-indigo-300">
            Travel <span className="text-slate-400 font-normal">· from {current.name}</span>
          </h2>
          <div className="text-sm text-slate-300">
            Engine efficiency:{' '}
            <span className="text-white font-semibold">{fuelPerLy} cr / ly</span>
          </div>
        </div>

        <div className="relative w-full h-72 rounded-lg bg-slate-900/50 border border-slate-700/50 overflow-hidden mb-6">
          <div className="absolute inset-0 opacity-30">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-0.5 h-0.5 rounded-full bg-white"
                style={{
                  left: `${(i * 37) % 100}%`,
                  top: `${(i * 53) % 100}%`,
                  opacity: 0.3 + ((i * 7) % 70) / 100,
                }}
              />
            ))}
          </div>
          {PLANETS.map((planet) => {
            const isCurrent = planet.id === game.planetId
            const meta = PLANET_TYPE_META[planet.type]
            return (
              <div
                key={planet.id}
                role="button"
                tabIndex={isCurrent ? -1 : 0}
                aria-label={isCurrent ? `${planet.name}, current location` : `Travel to ${planet.name}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group ${
                  isCurrent ? 'z-20' : 'z-10 cursor-pointer'
                }`}
                style={{ left: mapX(planet.position.x), top: mapY(planet.position.y) }}
                onClick={() => {
                  if (!isCurrent) requestTravel(planet)
                }}
                onKeyDown={(e) => {
                  if (!isCurrent && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    requestTravel(planet)
                  }
                }}
              >
                <div
                  className={`w-3 h-3 rounded-full ${isCurrent ? 'bg-indigo-400 ring-4 ring-indigo-400/30' : 'bg-slate-300 group-hover:bg-indigo-300'} transition-colors`}
                />
                <span
                  className={`text-[10px] mt-1 px-1.5 py-0.5 rounded ${isCurrent ? 'bg-indigo-500/60 text-white' : 'bg-slate-800/80 text-slate-300 group-hover:text-white'} whitespace-nowrap`}
                >
                  {meta.icon} {planet.name}
                </span>
              </div>
            )
          })}
          <div className="absolute bottom-2 right-3 text-[10px] text-slate-500">
            sector scale: max distance ~{farthestLy} ly
          </div>
        </div>

        {mapError && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-700/50 text-red-200 text-sm toast-in">
            {mapError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="py-2 pr-4">Destination</th>
                <th className="py-2 pr-4 text-right">Type</th>
                <th className="py-2 pr-4 text-right">Distance</th>
                <th className="py-2 pr-4 text-right">Fuel Cost</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {destinations.map(({ planet, cost, ly, check }) => {
                const meta = PLANET_TYPE_META[planet.type]
                return (
                  <tr key={planet.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-3 pr-4">
                      <div className="text-white font-medium">{planet.name}</div>
                      <div className="text-xs text-slate-500 line-clamp-1">{planet.description}</div>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <span className="text-slate-300 text-xs">{meta.icon} {planet.type}</span>
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-300">{ly} ly</td>
                    <td className="py-3 pr-4 text-right font-semibold text-white">{fmtMoney(cost)}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => requestTravel(planet)}
                        disabled={!check.ok || phase !== 'idle'}
                        title={check.reason}
                        className="btn-primary px-3 py-1.5 text-xs"
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
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-indigo-300">
            🛰️ Market Intelligence
          </h3>
          {!intelEnabled && (
            <span className="text-xs text-slate-500">
              Install the Navigation Array (Ship tab) to unlock trade leads.
            </span>
          )}
        </div>

        {!intelEnabled ? (
          <p className="text-sm text-slate-400">
            Without a Navigation Array your astrogation charts only plot routes, not
            prices. Upgrade your ship to see the best buy-to-sell runs.
          </p>
        ) : intel.length === 0 ? (
          <p className="text-sm text-slate-400">
            No profitable runs detected from this planet right now. Try a different
            market or wait a day for prices to shift.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="py-2 pr-4">Good</th>
                  <th className="py-2 pr-4">Buy Here</th>
                  <th className="py-2 pr-4">Sell At</th>
                  <th className="py-2 pr-4 text-right">Spread</th>
                  <th className="py-2 text-right">Potential</th>
                </tr>
              </thead>
              <tbody>
                {intel.map((lead) => (
                  <tr key={lead.commodityId} className="border-b border-slate-800/60">
                    <td className="py-2 pr-4">
                      <span className="font-medium text-white">
                        {lead.icon} {lead.commodityName}
                      </span>
                      {lead.holding > 0 && (
                        <span className="ml-2 text-xs text-cyan-300">holding {lead.holding}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-emerald-400">
                      {lead.originPlanetName} · {fmtMoney(lead.originPrice)}
                    </td>
                    <td className="py-2 pr-4 text-amber-300">
                      {lead.targetPlanetName} · {fmtMoney(lead.targetPrice)}
                    </td>
                    <td className="py-2 pr-4 text-right text-white font-semibold">
                      +{fmtMoney(lead.spread)}
                    </td>
                    <td className="py-2 text-right">
                      <span className="text-emerald-400 font-semibold">+{fmtMoney(lead.runProfit)}</span>
                      <div className="text-[10px] text-slate-500">after fuel & sell impact · load {lead.runQty} units</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmDest && (
        <Modal onClose={() => setConfirmDest(null)}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">{confirmDest.icon}</span>
            <div>
              <h2 className="text-2xl font-bold text-white">
                Plot course to {confirmDest.name}?
              </h2>
              <p className="text-sm text-slate-400">{confirmDest.description}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-xs uppercase tracking-wider text-slate-400">Distance</div>
              <div className="text-lg font-bold text-white">
                {distanceBetween(current, confirmDest)} ly
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-xs uppercase tracking-wider text-slate-400">Fuel Cost</div>
              <div className="text-lg font-bold text-amber-300">
                {fmtMoney(travelCost(game, confirmDest.id))}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-xs uppercase tracking-wider text-slate-400">Travel Time</div>
              <div className="text-lg font-bold text-white">
                {distanceBetween(current, confirmDest)} day{distanceBetween(current, confirmDest) > 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setConfirmDest(null)} className="btn-ghost flex-1">
              Cancel
            </button>
            <button onClick={executeTravel} className="btn-primary flex-1">
              Launch 🚀
            </button>
          </div>
        </Modal>
      )}

      {phase !== 'idle' && jumpTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-indigo-950/90 modal-fade" />
          <div className="absolute inset-0 warp-field" />
          <div className="absolute w-full h-px top-1/2 warp-flash bg-indigo-300 shadow-[0_0_30px_8px_rgba(129,140,248,0.8)]" />
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-0.5 h-16 warp-streak bg-indigo-200"
              style={{
                left: `${6 + i * 7}%`,
                top: `${20 + ((i * 41) % 55)}%`,
                transformOrigin: 'center',
                animationDelay: `${(i % 5) * 0.08}s`,
              }}
            />
          ))}
          <div className="relative text-center text-white">
            <div className="text-5xl mb-3">{jumpTo.icon}</div>
            <div className="text-2xl font-bold tracking-widest text-indigo-100 text-glow">
              {phase === 'charging' ? 'Charging jump drive…' : `Warp to ${jumpTo.name}`}
            </div>
            <div className="text-sm text-indigo-300 mt-1">
              {distanceBetween(current, jumpTo)} ly · {fmtMoney(travelCost(game, jumpTo.id))} fuel
            </div>
          </div>
        </div>
      )}

      {arrival && (
        <ArrivalReport game={game} info={arrival} onClose={() => setArrival(null)} />
      )}
    </div>
  )
}