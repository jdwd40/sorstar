import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import Starfield from './Starfield'
import AuthModal from './AuthModal'
import { PLANET_MAP } from '../data/gameData'
import { fmt, fmtMoney } from '../utils/format'
import { soundEnabled, setSoundEnabled } from '../utils/sound'

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
          <span>
            Your previous pilot could not be restored — its saved game is out of
            reach, so a fresh pilot was created.
          </span>
          <button
            onClick={dismissPilotLost}
            className="underline underline-offset-2 hover:text-white"
            aria-label="Dismiss pilot warning"
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
      className="text-slate-400 hover:text-white text-lg transition-colors"
      title={on ? 'Mute sounds' : 'Enable sounds'}
      aria-label={on ? 'Mute sounds' : 'Enable sounds'}
    >
      {on ? '🔊' : '🔇'}
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
        <span className="hidden sm:inline text-slate-400 max-w-[10rem] truncate" title={authUser.email}>
          👤 {authUser.email}
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

export default function Layout({ children }: LayoutProps) {
  const { game } = useGame()
  const planet = game ? PLANET_MAP[game.planetId] : null

  return (
    <div className="min-h-screen flex flex-col">
      <Starfield />
      <div className="sticky top-0 z-40">
        <SyncWarnings />
        <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <Link to={game ? '/game' : '/'} className="flex items-center gap-2">
            <span className="text-2xl">🚀</span>
            <span className="text-xl font-bold tracking-wide text-indigo-300 text-glow">
              SORSTAR
            </span>
          </Link>
          <div className="hidden sm:flex items-center gap-6 text-sm text-slate-300">
            {game && (
              <>
                <span>
                  <span className="text-slate-500">{planet?.icon}</span>{' '}
                  {planet?.name ?? ''}
                </span>
                <span>
                  Day <b className="text-white">{fmt(game.day)}</b>
                </span>
                <span>
                  Credits <b className="text-emerald-400">{fmtMoney(game.credits)}</b>
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
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