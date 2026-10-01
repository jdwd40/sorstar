import { useState } from 'react'
import type { Planet } from '../../types/game'
import { PLANETS } from '../../data/gameData'
import { fmt, fmtMoney } from '../../utils/format'
import PlanetVisual from './PlanetVisual'
import { IconScroll, IconWarning } from './Icons'

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
 * The sector chart.
 *
 * The map was the weakest screen in a game made of numbers: nine coloured dots,
 * a name in a grey chip, and everything needed to answer "where am I, where can
 * I go, and how far is it" sitting somewhere else on the page. This is the one
 * place that answers all three.
 *
 * - A real chart: a fine and a coarse grid, a soft radar sweep, and range
 *   spokes from wherever the ship is to everywhere else.
 * - Worlds, not dots: every node is a `PlanetVisual`, so a mining world looks
 *   like a mining world before the label is read.
 * - The ship is marked, and is the only node with a moving part.
 * - Hovering or tabbing to a world draws its route and quotes the hop on the
 *   readout, without needing a click.
 * - A market event is a flag, a contract due here is a badge with a count.
 *
 * Coordinates are each planet's own `position`, unchanged, so nothing about
 * where a world sits has moved.
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
  const mid = activePlanet
    ? {
        x: (current.position.x + activePlanet.position.x) / 2,
        y: (current.position.y + activePlanet.position.y) / 2,
      }
    : null

  return (
    <div className="relative h-[22.5rem] w-full overflow-hidden rounded-xl border border-slate-700/50 sm:h-80">
      {/* Deep space, then the chart grid, then the sweep. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(30,41,59,0.9) 0%, rgba(9,13,24,0.98) 70%)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'linear-gradient(rgba(148,163,184,0.11) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(148,163,184,0.11) 1px, transparent 1px)',
            'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
          ].join(','),
          backgroundSize: '25% 25%, 25% 25%, 6.25% 6.25%, 6.25% 6.25%',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 50%, transparent 48%, rgba(9,13,24,0.92) 100%)',
        }}
      />
      <div className="radar-sweep absolute inset-0" aria-hidden="true" />

      {/* Range spokes, with the plotted route picked out of them. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {PLANETS.map((planet) => {
          if (planet.id === current.id) return null
          const plotted = active === planet.id
          return (
            <line
              key={planet.id}
              x1={current.position.x}
              y1={current.position.y}
              x2={planet.position.x}
              y2={planet.position.y}
              stroke={plotted ? '#a5b4fc' : 'rgba(129,140,248,0.22)'}
              strokeWidth={plotted ? 1.5 : 1}
              strokeDasharray={plotted ? '6 4' : '2 5'}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={plotted ? { animation: 'route-shimmer 1.1s linear infinite' } : undefined}
            />
          )
        })}
      </svg>

      {/* Distance tag at the midpoint of the plotted route. */}
      {activePlanet && activeRoute && mid && (
        <span
          className="num pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-md border border-indigo-300/40 bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-200 shadow-lg"
          style={{ left: `${mid.x}%`, top: `${mid.y}%` }}
        >
          {fmt(activeRoute.ly)} ly
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

      {/* Readout: the answer to "how far is it, and can I afford it". */}
      <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-3">
        <div className="text-[11px] text-slate-300">
          {activePlanet && activeRoute ? (
            <>
              <span className="font-semibold text-white">{activePlanet.name}</span>
              <span className="text-slate-500"> · </span>
              {fmt(activeRoute.ly)} ly
              <span className="text-slate-500"> · </span>
              {fmtMoney(activeRoute.cost)} fuel
              {activeRoute.blocked && (
                <span className="ml-2 text-rose-300">{activeRoute.blocked}</span>
              )}
            </>
          ) : (
            <span className="text-slate-500">Hover a world to plot a route · tap to set course</span>
          )}
        </div>
        <div className="hidden shrink-0 text-right text-[10px] text-slate-500 sm:block">
          <div className="flex items-center justify-end gap-2">
            <span className="flex items-center gap-1 text-amber-300/80">
              <IconWarning className="h-3 w-3" />
              event
            </span>
            <span className="flex items-center gap-1 text-violet-300/80">
              <IconScroll className="h-3 w-3" />
              delivery
            </span>
            <span className="text-indigo-200/80">◇ you</span>
          </div>
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
  // over each other on a phone.
  const labelAbove = planet.position.y >= 60
  const ly = route?.ly ?? 0
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
        `${fmtMoney(route?.cost ?? 0)} fuel`,
        route?.blocked ?? '',
        ...marks,
      ]
        .filter(Boolean)
        .join(', ')}
      className={`group absolute z-10 flex w-24 -translate-x-1/2 -translate-y-[calc(50%+11px)] flex-col items-center ${
        labelAbove ? 'flex-col-reverse' : ''
      } ${current ? 'z-20' : busy ? '' : 'cursor-pointer'}`}
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
      <span className="relative flex items-center justify-center">
        {current && (
          <span className="ship-marker absolute -top-3.5 text-indigo-200" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M12 2c2.2 2 3.3 4.6 3.3 7.6l1.3 2.9H7.4l1.3-2.9C8.7 6.6 9.8 4 12 2zm-1.6 12.1h3.2l-.5 3.4-1.1 2.2-1.1-2.2z" />
            </svg>
          </span>
        )}
        <PlanetVisual
          planet={planet}
          size="sm"
          highlight={current ? 'current' : active ? 'selected' : null}
          className="transition-transform duration-200 group-hover:scale-110"
        />
        {event && (
          <span
            className="absolute -right-2.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-amber-400/60 bg-amber-500/25 text-amber-200 shadow-[0_0_10px_-2px_rgba(251,191,36,0.9)]"
            title="A market event is running here"
          >
            <IconWarning className="h-2.5 w-2.5" />
          </span>
        )}
        {due > 0 && (
          <span
            className="num absolute -left-2.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-violet-400/60 bg-violet-500/25 px-0.5 text-[9px] font-bold text-violet-100 shadow-[0_0_10px_-2px_rgba(167,139,250,0.9)]"
            title={`${due} contract${due > 1 ? 's' : ''} to deliver here`}
          >
            {due}
          </span>
        )}
      </span>

      <span
        className={`mt-1 whitespace-nowrap rounded-md border px-1 py-0.5 text-[9px] font-semibold leading-tight transition-colors sm:px-1.5 sm:text-[10px] ${
          current
            ? 'border-indigo-400/60 bg-indigo-500/25 text-white'
            : active
              ? 'border-indigo-300/60 bg-slate-800 text-white'
              : 'border-slate-700/60 bg-slate-950/80 text-slate-300 group-hover:border-slate-500 group-hover:text-white'
        }`}
      >
        {planet.name}
      </span>
      {active && (
        <span className="mt-0.5 whitespace-nowrap text-[9px] uppercase tracking-wider text-indigo-300/90">
          {route?.blocked ? 'no route' : `${fmt(ly)} ly`}
        </span>
      )}
    </div>
  )
}