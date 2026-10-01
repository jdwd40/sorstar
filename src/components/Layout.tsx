import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import Starfield from './Starfield'
import AuthModal from './AuthModal'
import { PLANET_MAP, cargoCapacityAtLevel } from '../data/gameData'
import { cargoUsed } from '../services/marketService'
import { fmt, fmtMoney } from '../utils/format'
import { soundEnabled, setSoundEnabled } from '../utils/sound'
import PlanetVisual from './ui/PlanetVisual'
import StatusChip from './ui/StatusChip'
import {
  IconCargo,
  IconCredits,
  IconDay,
  IconMuted,
  IconSound,
  IconMark,
  IconUser,
} from './ui/Icons'

interface LayoutProps {
  children: ReactNode
}

function SyncWarnings() {
  const { persistError, pilotLost, dismissPilotLost } = useGame()
  return (
    <>
      {persistError && (
        <div
          role="alert"
          className="bg-amber-950/95 border-b border-amber-700/50 text-amber-200 text-xs text-center py-1.5 px-3"
        >
          Progress is not syncing with the save server — it may be unreachable.
          Will retry on your next action.
        </div>
      )}
      {pilotLost && (
        <div
          role="alert"
          className="bg-rose-950/95 border-b border-rose-700/50 text-rose-200 text-xs text-center py-1.5 px-3 flex items-center justify-center gap-3"
        >
          {/* 'account' is recoverable - the save is intact, only the browser's
              session was, so point at signing in again. */}
          <span>
            {pilotLost === 'account'
              ? 'Your saved session could not be restored, so a temporary pilot was used. Sign in again to pick up your account where you left off.'
              : 'Your previous pilot could not be restored — its saved game is out of reach, so a fresh pilot was created.'}
          </span>
          <button
            onClick={dismissPilotLost}
            className="underline underline-offset-2 hover:text-white"
            aria-label={
              pilotLost === 'account'
                ? 'Dismiss account warning'
                : 'Dismiss pilot warning'
            }
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  )
}

function SoundToggle() {
  const [on, setOn] = useState(soundEnabled())
  return (
    <button
      onClick={() => {
        const next = !on
        setSoundEnabled(next)
        setOn(next)
      }}
      className="btn-ghost !px-2 !py-1.5 text-slate-400 hover:text-white transition-colors"
      title={on ? 'Mute sounds' : 'Enable sounds'}
      aria-label={on ? 'Mute sounds' : 'Enable sounds'}
    >
      {on ? <IconSound className="h-4 w-4" /> : <IconMuted className="h-4 w-4" />}
    </button>
  )
}

function AccountControl() {
  const { authUser, authAvailable, authBusy, logout } = useGame()
  const [showAuth, setShowAuth] = useState(false)

  if (!authAvailable) return null

  if (authBusy) {
    return <span className="text-xs text-slate-500">Syncing…</span>
  }

  if (authUser) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span
          className="hidden items-center gap-1 text-slate-400 sm:inline-flex max-w-[10rem] truncate"
          title={authUser.email}
        >
          <IconUser className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{authUser.email}</span>
        </span>
        <button
          onClick={() => void logout()}
          className="text-slate-400 hover:text-white underline underline-offset-2"
          title={`Sign out of ${authUser.email}`}
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowAuth(true)}
        className="btn-ghost text-xs px-3 py-1.5"
        title="Save this spaceship to an account"
      >
        Log in / Sign up
      </button>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}

/**
 * Credits, with the last change drifting up off the chip.
 *
 * Every way credits move - a trade, a delivery, upkeep, an encounter, an
 * upgrade - shows here, so the HUD answers "what did that just cost me" without
 * each action needing its own toast.
 */
function CreditsChip({ credits }: { credits: number }) {
  const prev = useRef(credits)
  const [delta, setDelta] = useState<{ id: number; amount: number } | null>(null)

  useEffect(() => {
    const amount = credits - prev.current
    prev.current = credits
    if (amount !== 0) setDelta((d) => ({ id: (d?.id ?? 0) + 1, amount }))
  }, [credits])

  return (
    <span className="relative">
      <StatusChip
        label="Credits"
        value={fmtMoney(credits)}
        tone="text-emerald-300"
        icon={<IconCredits className="h-3.5 w-3.5" />}
        labelClassName="hidden md:inline"
        title={`${fmtMoney(credits)} credits`}
      />
      {delta && (
        <span
          key={delta.id}
          className={`credit-float num pointer-events-none absolute right-1 top-full mt-2 whitespace-nowrap text-[11px] font-bold ${
            delta.amount > 0 ? 'text-emerald-300' : 'text-rose-300'
          }`}
          aria-hidden="true"
        >
          {delta.amount > 0 ? '+' : '-'}
          {fmtMoney(Math.abs(delta.amount))}
        </span>
      )}
    </span>
  )
}

/**
 * The readouts worth seeing on every screen, in the order they matter while
 * playing: where the ship is, what it is worth, how full it is, and how far in.
 *
 * This used to be three spans of text that vanished under 640px, so on a phone -
 * the only screen where you would want them - the only way to see your credits
 * was to open the market.
 */
function HeadHud() {
  const { game } = useGame()
  if (!game) return null

  const planet = PLANET_MAP[game.planetId]
  const capacity = cargoCapacityAtLevel(game.ship.cargoLevel)
  const used = cargoUsed(game)

  return (
    <div className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto">
      <StatusChip
        label={planet?.name ?? 'Sector'}
        value={<PlanetVisual planet={planet} size="xs" highlight="current" />}
        title="Current location"
        className="hidden lg:flex"
      />
      <StatusChip
        label="Day"
        value={fmt(game.day)}
        icon={<IconDay className="h-3.5 w-3.5" />}
        labelClassName="hidden md:inline"
        title={`Day ${fmt(game.day)}`}
      />
      <CreditsChip credits={game.credits} />
      <StatusChip
        label="Cargo"
        value={`${fmt(used)}/${fmt(capacity)}`}
        meter={capacity > 0 ? used / capacity : 0}
        meterTone={
          used >= capacity
            ? 'from-amber-400 to-rose-400'
            : used / capacity > 0.75
              ? 'from-amber-400 to-yellow-300'
              : 'from-cyan-400 to-indigo-400'
        }
        icon={<IconCargo className="h-3.5 w-3.5" />}
        labelClassName="hidden lg:inline"
        title={`${fmt(used)} of ${fmt(capacity)} cargo bays used`}
      />
    </div>
  )
}

export default function Layout({ children }: LayoutProps) {
  const { game } = useGame()

  return (
    <div className="min-h-screen flex flex-col">
      <Starfield />
      <div className="sticky top-0 z-40">
        <SyncWarnings />
        <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md">
          <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2">
            <Link
              to={game ? '/game' : '/'}
              className="flex items-center gap-2 text-indigo-300"
              title="Sorstar"
            >
              <IconMark className="h-6 w-6 text-indigo-300 text-glow" />
              <span className="hidden text-xl font-bold tracking-wide text-glow sm:inline">
                SORSTAR
              </span>
            </Link>
            <HeadHud />
            <div className="flex items-center gap-2 sm:gap-3">
              <AccountControl />
              <SoundToggle />
            </div>
          </div>
        </header>
      </div>

      <main className="flex-grow w-full max-w-6xl mx-auto px-4 py-6">{children}</main>

      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        Sorstar · a small space trading sim
      </footer>
    </div>
  )
}