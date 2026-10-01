import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import Layout from '../components/Layout'
import MarketPanel from '../components/MarketPanel'
import TravelPanel from '../components/TravelPanel'
import ArrivalReport from '../components/ArrivalReport'
import EncounterModal from '../components/EncounterModal'
import ContractsPanel from '../components/ContractsPanel'
import ShipPanel from '../components/ShipPanel'
import LogPanel from '../components/LogPanel'
import VictoryModal from '../components/VictoryModal'
import { GAME_TARGET_NET_WORTH, PLANET_MAP, cargoCapacityAtLevel } from '../data/gameData'
import { cargoUsed } from '../services/marketService'
import { cargoSaleValue, goalProgress, netWorth } from '../services/gameService'
import { fmt, fmtMoney, fmtPct } from '../utils/format'
import { sound } from '../utils/sound'
import type { ActionResult } from '../context/GameContext'
import type { TravelResult } from '../services/travelService'

type Tab = 'market' | 'travel' | 'contracts' | 'ship' | 'log'

type SoundKind = 'buy' | 'sell' | 'wait' | 'travel' | 'upgrade' | 'win' | 'error'

interface Flash {
  message: string
  kind: 'ok' | 'error'
}

/** An arrival report, plus what happened on the way there if anything did. */
interface Arrival {
  info: TravelResult
  note?: string
}

export default function GamePage() {
  const {
    game,
    ready,
    buy,
    sell,
    waitDay,
    travel,
    resolveEncounter,
    travelUpgrade,
    acceptContract,
    deliverContract,
    resetGame,
    dismissVictory,
  } = useGame()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('market')
  const [flash, setFlash] = useState<Flash | null>(null)
  const [arrival, setArrival] = useState<Arrival | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasVictory = useRef(false)

  useEffect(() => {
    if (ready && !game) {
      navigate('/', { replace: true })
    }
  }, [game, ready, navigate])

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  useEffect(() => {
    if (game?.stats.victory && !game.stats.victorySeen && !wasVictory.current) {
      wasVictory.current = true
      sound.win()
    }
  }, [game])

  if (!ready) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[40vh] text-slate-300">
          Loading…
        </div>
      </Layout>
    )
  }

  if (!game) return null

  const planet = PLANET_MAP[game.planetId] ?? PLANET_MAP['eden']!
  const capacity = cargoCapacityAtLevel(game.ship.cargoLevel)
  const used = cargoUsed(game)
  const nw = netWorth(game)
  const holdValue = cargoSaleValue(game)
  const progress = goalProgress(game)
  const showVictory = game.stats.victory && !game.stats.victorySeen

  const flashMessage = (message: string, kind: Flash['kind']) => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlash({ message, kind })
    flashTimer.current = setTimeout(() => setFlash(null), 3500)
  }

  const runAction = (fn: () => ActionResult, okSound?: SoundKind): ActionResult => {
    const res = fn()
    if (res.ok) {
      if (okSound) sound[okSound]()
      flashMessage(res.message, 'ok')
    } else {
      sound.error()
      flashMessage(res.message, 'error')
    }
    return res
  }

  const showArrival = (info: TravelResult) => setArrival({ info })

  /**
   * Answers an encounter and, if the ship made it, shows where it landed.
   *
   * The report carries a line naming what happened in transit, because an
   * arrival that quietly cost a day and a few hundred credits deserves to say so.
   */
  const handleEncounterResolved = (res: ActionResult) => {
    if (!res.ok) {
      sound.error()
      flashMessage(res.message, 'error')
      return
    }
    sound.travel()
    flashMessage(res.message, 'ok')
    if (res.info) setArrival({ info: res.info, note: res.message })
  }

  const handleNewGame = () => {
    // Always confirm from the game screen too - a stray click on "Start new
    // game" at the victory screen must not silently erase the account save.
    if (!window.confirm('Erase this save and return to the title screen?')) return
    resetGame()
    navigate('/', { replace: true })
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'market', label: 'Trade', icon: '🛒' },
    { id: 'travel', label: 'Travel', icon: '🛰️' },
    { id: 'contracts', label: 'Contracts', icon: '📜' },
    { id: 'ship', label: 'Ship', icon: '🛸' },
    { id: 'log', label: 'Log', icon: '📋' },
  ]

  return (
    <Layout>
      <div className="space-y-5">
        {flash && (
          <div
            className={`toast-in px-4 py-3 rounded-lg border text-sm font-medium flex items-center gap-3 ${
              flash.kind === 'ok'
                ? 'bg-emerald-900/70 border-emerald-700/60 text-emerald-100'
                : 'bg-red-900/70 border-red-700/60 text-red-100'
            }`}
            role="status"
          >
            <span className="text-lg">{flash.kind === 'ok' ? '✅' : '⛔'}</span>
            <span>{flash.message}</span>
          </div>
        )}

        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{planet.icon}</span>
              <div>
                <div className="font-bold text-white text-lg leading-tight">
                  {planet.name}
                </div>
                <div className="text-xs text-slate-400">
                  Day {fmt(game.day)} · {planet.type}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Credits</span>
              <span className="text-lg font-bold text-emerald-400">
                {fmtMoney(game.credits)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Cargo</span>
              <span className="font-semibold text-white">
                {fmt(used)}/{fmt(capacity)}
              </span>
              <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all"
                  style={{ width: `${(used / capacity) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Net Worth</span>
              <span className="font-semibold text-indigo-300">{fmtMoney(nw)}</span>
              {/* Net worth counts cargo at cost, so this market figure is
                  informational only and is labelled to say so. */}
              <span
                className="text-xs text-slate-500"
                title="What your hold would credit you for if you sold it all here right now, after the market absorbs your order. Not counted in net worth."
              >
                (hold would sell for {fmtMoney(holdValue)} here)
              </span>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>
                Goal: reach a net worth of <b className="text-white">{fmtMoney(GAME_TARGET_NET_WORTH)}</b>
              </span>
              <span className={progress >= 1 ? 'text-emerald-400 font-bold' : ''}>
                {progress >= 1 ? 'TRAILBLAZER ACHIEVED!' : fmtPct(progress)}
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${progress >= 1 ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-b border-slate-700 pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-t-lg text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-slate-800 text-white border border-b-0 border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'market' && (
          <MarketPanel
            game={game}
            planet={planet}
            buy={(id, qty) => runAction(() => buy(id, qty), 'buy')}
            sell={(id, qty) => runAction(() => sell(id, qty), 'sell')}
            waitDay={() => runAction(() => waitDay(), 'wait')}
          />
        )}
        {tab === 'travel' && (
          <TravelPanel
            game={game}
            travel={(id) => runAction(() => travel(id))}
            onArrival={showArrival}
          />
        )}
        {tab === 'contracts' && (
          <ContractsPanel
            game={game}
            acceptContract={(id) => runAction(() => acceptContract(id), 'buy')}
            deliverContract={(id) => runAction(() => deliverContract(id), 'sell')}
          />
        )}
        {tab === 'ship' && (
          <ShipPanel
            game={game}
            travelUpgrade={(type) => runAction(() => travelUpgrade(type), 'upgrade')}
            resetGame={handleNewGame}
          />
        )}
        {tab === 'log' && <LogPanel game={game} />}
      </div>

      {showVictory && (
        <VictoryModal
          game={game}
          onContinue={() => dismissVictory()}
          onNewGame={handleNewGame}
        />
      )}

      {/*
        Both of these sit above the tabs on purpose. An encounter can interrupt a
        jump from any tab, and the player may well have switched away from Travel
        before the animation finished, so the ship would otherwise be stuck
        mid-jump behind a tab that can no longer be used.
      */}
      {game.pendingEncounter && (
        <EncounterModal
          game={game}
          onChoose={(id) => resolveEncounter(id)}
          onResolved={handleEncounterResolved}
        />
      )}

      {arrival && (
        <ArrivalReport
          game={game}
          info={arrival.info}
          note={arrival.note}
          onClose={() => setArrival(null)}
        />
      )}
    </Layout>
  )
}