import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import Starfield from './Starfield'
import { PLANET_MAP } from '../data/gameData'
import { fmt, fmtMoney } from '../utils/format'
import { soundEnabled, setSoundEnabled } from '../utils/sound'

interface LayoutProps {
  children: ReactNode
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

export default function Layout({ children }: LayoutProps) {
  const { game } = useGame()
  const planet = game ? PLANET_MAP[game.planetId] : null

  return (
    <div className="min-h-screen flex flex-col">
      <Starfield />
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-sm sticky top-0 z-40">
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
          <SoundToggle />
        </div>
      </header>

      <main className="flex-grow w-full max-w-6xl mx-auto px-4 py-6">{children}</main>

      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        Sorstar · a small space trading sim
      </footer>
    </div>
  )
}