import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import Layout from '../components/Layout'
import {
  GAME_TARGET_NET_WORTH,
  PLANETS,
  PLANET_MAP,
  cargoCapacityAtLevel,
} from '../data/gameData'
import { netWorth } from '../services/gameService'
import { fmt, fmtMoney } from '../utils/format'
import PlanetVisual from '../components/ui/PlanetVisual'
import { StatTile } from '../components/ui/StatusChip'
import { IconCredits, IconMark, IconShip } from '../components/ui/Icons'

export default function StartPage() {
  const { game, ready, loadError, retryLoad, startNewGame, resetGame } = useGame()
  const navigate = useNavigate()
  const [confirmReset, setConfirmReset] = useState(false)
  const hasSave = game !== null

  const handleNewGame = () => {
    if (hasSave || loadError) {
      if (!window.confirm('Start a new game? Your current save will be overwritten.')) return
    }
    startNewGame()
    navigate('/game')
  }

  const handleContinue = () => {
    navigate('/game')
  }

  const handleReset = () => {
    resetGame()
    setConfirmReset(false)
  }

  const planet = game ? PLANET_MAP[game.planetId] : null
  const nw = game ? netWorth(game) : 0
  const progress = game ? Math.min(1, nw / GAME_TARGET_NET_WORTH) : 0

  return (
    <Layout>
      <div className="flex flex-col items-center py-8 text-center">
        <IconMark className="mb-4 h-16 w-16 text-indigo-300 text-glow" />
        <h1 className="mb-2 text-5xl font-black tracking-widest text-indigo-200 text-glow sm:text-6xl">
          SORSTAR
        </h1>
        <p className="mb-8 max-w-xl text-lg text-slate-300">
          Buy low, fly far, sell high. Weave a trading empire across a small galaxy of
          nine planets — and grow your little freighter into a merchant legend.
        </p>

        {/* The whole sector, at a glance. Every world you can trade with, in the
            colours you will meet them in. */}
        <ul className="mb-8 flex max-w-3xl flex-wrap items-start justify-center gap-x-4 gap-y-3">
          {PLANETS.map((p) => (
            <li key={p.id} className="flex w-16 flex-col items-center gap-1">
              <PlanetVisual planet={p} size="sm" />
              <span className="text-[10px] leading-tight text-slate-400">{p.name}</span>
            </li>
          ))}
        </ul>

        {loadError && (
          <div
            className="card mb-6 w-full max-w-2xl border-amber-700/60 bg-amber-950/50 p-4 text-left"
            role="alert"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-amber-200">
                <b>Could not load your save.</b> The save server may be unreachable —
                starting a new game now could overwrite it.
              </div>
              <button onClick={retryLoad} className="btn-ghost btn-sm whitespace-nowrap">
                Retry
              </button>
            </div>
          </div>
        )}

        <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <button onClick={handleNewGame} disabled={!ready} className="btn-primary py-4 text-lg">
            {hasSave ? 'New Game' : 'Start Trading'}
          </button>
          <button
            onClick={handleContinue}
            className="btn-ghost py-4 text-lg"
            disabled={!ready || !game}
          >
            Continue Game
          </button>
        </div>

        {game && (
          <div className="card mt-8 w-full max-w-2xl p-5 text-left">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="panel-heading">Current save</h2>
              <span className="num text-sm text-slate-300">
                Net worth{' '}
                <span className="font-bold text-indigo-200">{fmtMoney(nw)}</span>
                <span className="text-slate-500"> / {fmtMoney(GAME_TARGET_NET_WORTH)}</span>
              </span>
            </div>

            <div className="meter mb-4">
              <div
                className={`meter-fill bg-gradient-to-r ${
                  progress >= 1 ? 'from-emerald-400 to-cyan-300' : 'from-indigo-500 to-cyan-300'
                }`}
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
              <PlanetVisual planet={planet ?? undefined} size="md" highlight="current" />
              <div className="min-w-0">
                <div className="font-semibold text-white">{planet?.name ?? 'Sector'}</div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <IconShip className="h-3 w-3" />
                  {game.ship.name} · {game.ship.className}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Day" value={fmt(game.day)} />
              <StatTile
                label="Credits"
                value={
                  <span className="flex items-center justify-center gap-1">
                    <IconCredits className="h-3.5 w-3.5" />
                    {fmtMoney(game.credits)}
                  </span>
                }
                tone="text-emerald-300"
              />
              <StatTile
                label="Cargo space"
                value={fmt(cargoCapacityAtLevel(game.ship.cargoLevel))}
                hint="units"
              />
              <StatTile label="Trips" value={fmt(game.stats.tripsMade)} />
            </div>

            {confirmReset ? (
              <div className="mt-6 flex items-center justify-center gap-3">
                <span className="text-sm text-slate-300">Erase this save permanently?</span>
                <button onClick={handleReset} className="btn-danger">
                  Yes, reset
                </button>
                <button onClick={() => setConfirmReset(false)} className="btn-ghost">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="mt-6 text-center">
                <button
                  onClick={() => setConfirmReset(true)}
                  className="text-sm text-rose-300/80 underline underline-offset-2 hover:text-rose-200"
                >
                  Reset Game
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}