import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import Layout from '../components/Layout'
import { GAME_TARGET_NET_WORTH, PLANET_MAP, PLANET_TYPE_META, cargoCapacityAtLevel } from '../data/gameData'
import { netWorth } from '../services/gameService'
import { fmt, fmtMoney } from '../utils/format'

export default function StartPage() {
  const { game, saveExists, startNewGame, continueGame, resetGame } = useGame()
  const navigate = useNavigate()
  const [confirmReset, setConfirmReset] = useState(false)

  const handleNewGame = () => {
    if (saveExists) {
      if (!window.confirm('Start a new game? Your current save will be overwritten.')) return
    }
    startNewGame()
    navigate('/game')
  }

  const handleContinue = () => {
    continueGame()
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
      <div className="flex flex-col items-center justify-center text-center py-10">
        <div className="text-6xl mb-4">🚀</div>
        <h1 className="text-5xl font-black tracking-widest text-indigo-300 text-glow mb-2">
          SORSTAR
        </h1>
        <p className="text-slate-300 text-lg max-w-xl mb-10">
          Buy low, fly far, sell high. Weave a trading empire across a small galaxy of
          nine planets — and grow your little freighter into a merchant legend.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
          <button onClick={handleNewGame} className="btn-primary text-lg py-4">
            {saveExists ? 'New Game' : 'Start Trading'}
          </button>
          <button
            onClick={handleContinue}
            className="btn-ghost text-lg py-4"
            disabled={!game}
          >
            Continue Game
          </button>
        </div>

        {game && (
          <div className="mt-8 card p-6 w-full max-w-2xl text-left">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm uppercase tracking-wider text-slate-400">
                Current Save
              </h2>
              <div className="text-sm text-slate-300">
                Net worth{' '}
                <span className="text-indigo-300 font-bold">{fmtMoney(nw)}</span>
                <span className="text-slate-500"> / {fmtMoney(GAME_TARGET_NET_WORTH)}</span>
              </div>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-4">
              <div
                className={`h-full transition-all ${progress >= 1 ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-400">Day</div>
                <div className="text-white font-semibold">{fmt(game.day)}</div>
              </div>
              <div>
                <div className="text-slate-400">Credits</div>
                <div className="text-emerald-400 font-semibold">
                  {fmtMoney(game.credits)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Location</div>
                <div className="text-white font-semibold">
                  {planet && (
                    <>
                      {PLANET_TYPE_META[planet.type].icon} {planet.name}
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Ship</div>
                <div className="text-white font-semibold">{game.ship.name}</div>
              </div>
              <div>
                <div className="text-slate-400">Cargo Space</div>
                <div className="text-white font-semibold">
                  {fmt(cargoCapacityAtLevel(game.ship.cargoLevel))} units
                </div>
              </div>
              <div>
                <div className="text-slate-400">Trips Made</div>
                <div className="text-white font-semibold">{fmt(game.stats.tripsMade)}</div>
              </div>
            </div>

            {confirmReset ? (
              <div className="mt-6 flex gap-3 items-center justify-center">
                <span className="text-sm text-slate-300">
                  Erase this save permanently?
                </span>
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
                  className="text-red-400/80 hover:text-red-300 text-sm underline underline-offset-2"
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