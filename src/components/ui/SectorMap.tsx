import { useState } from 'react'
import type { Planet } from '../../types/game'
import { PLANETS } from '../../data/gameData'
import { fmt, fmtMoney } from '../../utils/format'
import PlanetVisual from './PlanetVisual'
import { IconScroll, IconShip, IconWarning } from './Icons'

/** What the chart needs to know about a hop it is not making yet. */
export interface SectorRoute {
  ly: number
  cost: number
  /** Why this one cannot be flown right now, or null. */
  blocked: string | null
}

interface SectorMapProps {
  current: Planet
  routes: ReadonlyMap<string, SectorRoute>
  /**
   * Planets with a market event running, as a flag and nothing more.
   *
   * Presence is public without a Navigation Array - the map has always shown it
   * - but which good, and by how much, is intel the player has to earn, so nothing
   * here says.
   */
  eventPlanets: ReadonlySet<string>
  /** Active contracts waiting to be handed over at each planet. */
  dueHere: ReadonlyMap<string, number>
  busy?: boolean
  onSelect: (planet: Planet) => void
}

/**
 * Range rings around the ship, every `RING_STEP` light years. A chart unit is a
 * tenth of a light year and `distanceBetween` rounds, so everything inside the
 * ring drawn at `(ly + 0.5) * 10` is at most `ly` light years away. Unlabelled -
 * any label lands on some world's name - so the legend states the step.
 */
const RING_STEP = 2
const RANGE_RINGS = [2, 4, 6, 8]
const ringRadius = (ly: number) => (ly + 0.5) * 10

/**
 * The sector chart.
 *
 * The one place that answers "where am I, where can I go, how far is it, and
 * which worlds matter right now":
 *
 * - Range rings and the radar sweep are centred on the ship, so distance reads
 *   off the chart before anything is hovered.
 * - Every node is a `PlanetVisual`, anchored at its centre on the planet's own
 *   `position` - the label hangs off it - so route lines meet the world.
 * - Hovering or tabbing to a world plots the route and quotes the hop.
 * - A market event is a flag, a contract due here is a badge with a count, and
 *   a hop the ship cannot make is dimmed.
 */
export default function SectorMap({
  current,
  routes,
  eventPlanets,
  dueHere,
  busy = false,
  onSelect,
}: SectorMapProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = activeId && activeId !== current.id ? activeId : null
  const activePlanet = active ? PLANETS.find((p) => p.id === active) : undefined
  const activeRoute = active ? routes.get(active) : undefined
  const { x: cx, y: cy } = current.position
  const mid = activePlanet
    ? { x: (cx + activePlanet.position.x) / 2, y: (cy + activePlanet.position.y) / 2 }
    : null

  return (
    <div className="sector-chart relative h-[22.5rem] w-full overflow-hidden rounded-xl border border-indigo-400/20 sm:h-[26rem]">
      {/* Grid, then a vignette, then the ship's sweep. */}
      <div className="sector-grid absolute inset-0" aria-hidden="true" />
      <div className="radar-sweep" style={{ left: `${cx}%`, top: `${cy}%` }} aria-hidden="true" />

      {/* Range rings and spokes, with the plotted route picked out of them. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {RANGE_RINGS.map((ly) => (
          <ellipse
            key={ly}
            cx={cx}
            cy={cy}
            rx={ringRadius(ly)}
            ry={ringRadius(ly)}
            fill="none"
            stroke="rgba(129,140,248,0.16)"
            strokeDasharray="1 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {PLANETS.map((planet) => {
          if (planet.id === current.id) return null
          const plotted = active === planet.id
          const line = {
            x1: cx,
            y1: cy,
            x2: planet.position.x,
            y2: planet.position.y,
            vectorEffect: 'non-scaling-stroke' as const,
            strokeLinecap: 'round' as const,
          }
          return plotted ? (
            <g key={planet.id}>
              <line {...line} stroke="rgba(165,180,252,0.25)" strokeWidth={6} />
              <line
                {...line}
                stroke="#c7d2fe"
                strokeWidth={1.75}
                strokeDasharray="6 4"
                className="route-shimmer"
              />
            </g>
          ) : (
            <line
              key={planet.id}
              {...line}
              stroke="rgba(129,140,248,0.2)"
              strokeWidth={1}
              strokeDasharray="2 5"
            />
          )
        })}
      </svg>

      {/* Distance tag at the midpoint of the plotted route. */}
      {activePlanet && activeRoute && mid && (
        <span
          className="num pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-md border border-indigo-300/50 bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-100 shadow-[0_0_16px_-4px_rgba(129,140,248,0.9)]"
          style={{ left: `${mid.x}%`, top: `${mid.y}%` }}
        >
          {fmt(activeRoute.ly)} ly · {fmtMoney(activeRoute.cost)}
        </span>
      )}

      {PLANETS.map((planet) => (
        <Node
          key={planet.id}
          planet={planet}
          current={planet.id === current.id}
          route={routes.get(planet.id)}
          event={eventPlanets.has(planet.id)}
          due={dueHere.get(planet.id) ?? 0}
          active={active === planet.id}
          busy={busy}
          onSelect={onSelect}
          onActive={setActiveId}
        />
      ))}

      {/* Readout: where the ship is, or the hop being looked at. */}
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-end justify-between gap-3">
        <div className="rounded-lg border border-slate-700/60 bg-slate-950/80 px-2 py-1 text-[11px] text-slate-300 backdrop-blur-sm">
          {activePlanet && activeRoute ? (
            <>
              <span className="font-semibold text-white">{activePlanet.name}</span>
              <span className="text-slate-500"> · </span>
              <span className="num">{fmt(activeRoute.ly)} ly</span>
              <span className="text-slate-500"> · </span>
              <span className="num">{fmtMoney(activeRoute.cost)} fuel</span>
              {activeRoute.blocked && (
                <span className="ml-2 text-rose-300">{activeRoute.blocked}</span>
              )}
            </>
          ) : (
            <>
              <span className="text-indigo-200">Docked at {current.name}</span>
              <span className="text-slate-500">
                <span className="hidden sm:inline"> · hover a world to plot a route</span>
                <span className="sm:hidden"> · tap a world</span>
              </span>
            </>
          )}
        </div>
        <div className="hidden shrink-0 items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/80 px-2 py-1 text-[10px] text-slate-400 sm:flex">
          <span className="flex items-center gap-1 text-amber-300/90">
            <IconWarning className="h-3 w-3" />
            event
          </span>
          <span className="flex items-center gap-1 text-violet-300/90">
            <IconScroll className="h-3 w-3" />
            delivery
          </span>
          <span className="flex items-center gap-1 text-indigo-200/90">
            <IconShip className="h-3 w-3" />
            you
          </span>
          <span className="num text-indigo-300/70">◌ {RING_STEP} ly rings</span>
        </div>
      </div>
    </div>
  )
}

interface NodeProps {
  planet: Planet
  current: boolean
  route: SectorRoute | undefined
  event: boolean
  due: number
  active: boolean
  busy: boolean
  onSelect: (planet: Planet) => void
  onActive: (id: string | null) => void
}

function Node({ planet, current, route, event, due, active, busy, onSelect, onActive }: NodeProps) {
  // Labels sit below the world in the top half of the chart and above it in the
  // bottom half, which is what keeps the crowded southern systems from writing
  // over each other on a phone. The ship marker and the badges take the other
  // side, so nothing sits on the name.
  const labelAbove = planet.position.y >= 60
  const ly = route?.ly ?? 0
  const blocked = !current && Boolean(route?.blocked)
  const marks = [
    due > 0 ? `${due} contract${due > 1 ? 's' : ''} to deliver here` : null,
    event ? 'A market event is running here' : null,
  ].filter(Boolean)

  return (
    <div
      role="button"
      tabIndex={current || busy ? -1 : 0}
      aria-label={[
        current ? `${planet.name}, your location` : `Travel to ${planet.name}, ${ly} light years`,
        current ? '' : `${fmtMoney(route?.cost ?? 0)} fuel`,
        route?.blocked ?? '',
        ...marks,
      ]
        .filter(Boolean)
        .join(', ')}
      className={`group absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none ${
        current ? 'z-20' : active ? 'z-30' : 'z-10'
      } ${current || busy ? '' : 'cursor-pointer'}`}
      style={{ left: `${planet.position.x}%`, top: `${planet.position.y}%` }}
      onClick={() => {
        if (!current && !busy) onSelect(planet)
      }}
      onKeyDown={(e) => {
        if (current || busy) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(planet)
        }
      }}
      onMouseEnter={() => onActive(planet.id)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(planet.id)}
      onBlur={() => onActive(null)}
    >
      <span className={`relative block transition-opacity ${blocked && !active ? 'opacity-50' : ''}`}>
        {current && (
          <span
            className={`ship-marker absolute text-indigo-100 drop-shadow-[0_0_6px_rgba(165,180,252,0.9)] ${
              labelAbove ? '-bottom-6' : '-top-6'
            }`}
            aria-hidden="true"
          >
            <IconShip className="h-4 w-4" />
          </span>
        )}
        <PlanetVisual
          planet={planet}
          size="md"
          highlight={current ? 'current' : active ? 'selected' : null}
          className="scale-[0.8] transition-transform duration-200 group-hover:scale-90 group-focus-visible:scale-90 sm:scale-100 sm:group-hover:scale-110 sm:group-focus-visible:scale-110"
        />
        {event && (
          <span
            className={`event-pulse absolute -right-1.5 flex ${labelAbove ? '-bottom-1' : '-top-1'} h-4 w-4 items-center justify-center rounded-full border border-amber-300/70 bg-amber-500/30 text-amber-100`}
            title="A market event is running here"
          >
            <IconWarning className="h-2.5 w-2.5" />
          </span>
        )}
        {due > 0 && (
          <span
            className={`num absolute -left-1.5 flex h-4 min-w-4 ${labelAbove ? '-bottom-1' : '-top-1'} items-center justify-center rounded-full border border-violet-300/70 bg-violet-500/40 px-0.5 text-[9px] font-bold text-violet-50 shadow-[0_0_10px_-2px_rgba(167,139,250,0.9)]`}
            title={`${due} contract${due > 1 ? 's' : ''} to deliver here`}
          >
            {due}
          </span>
        )}
      </span>

      <span
        className={`pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center ${
          labelAbove ? 'bottom-full mb-0.5 flex-col-reverse sm:mb-1' : 'top-full mt-0.5 sm:mt-1'
        }`}
      >
        <span
          className={`whitespace-nowrap rounded-md border px-1 py-0.5 text-[9px] font-semibold leading-tight transition-colors sm:px-1.5 sm:text-[11px] ${
            current
              ? 'border-indigo-300/70 bg-indigo-500/30 text-white shadow-[0_0_14px_-4px_rgba(129,140,248,0.9)]'
              : active
                ? 'border-indigo-300/70 bg-slate-800 text-white'
                : blocked
                  ? 'border-slate-800/80 bg-slate-950/80 text-slate-500'
                  : 'border-slate-700/60 bg-slate-950/80 text-slate-200 group-hover:border-slate-500 group-hover:text-white'
          }`}
        >
          {planet.name}
        </span>
        {active && route?.blocked && (
          <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider text-rose-300">
            no route
          </span>
        )}
      </span>
    </div>
  )
}
