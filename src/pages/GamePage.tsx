import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { IconPlanetType } from '../components/ui/Icons'
import Layout from '../components/Layout'
import MarketPanel from '../components/MarketPanel'
import TravelPanel from '../components/TravelPanel'
import ArrivalReport from '../components/ArrivalReport'
import EncounterModal from '../components/EncounterModal'
import ContractsPanel from '../components/ContractsPanel'
import ShipPanel from '../components/ShipPanel'
import LogPanel from '../components/LogPanel'
import VictoryModal from '../components/VictoryModal'
import {
  COMMODITY_MAP,
  GAME_TARGET_NET_WORTH,
  PLANET_MAP,
  dailyUpkeep,
} from '../data/gameData'
import { quoteBuy, quoteSell } from '../services/marketService'
import { commodityEventScale, eventsAt } from '../services/marketEventService'
import { contractDests } from '../services/contractService'
import { cargoSaleValue, goalProgress, netWorth } from '../services/gameService'
import { fmt, fmtMoney, fmtPct } from '../utils/format'
import { sound } from '../utils/sound'
import type { ActionResult } from '../context/GameContext'
import type { TravelResult } from '../services/travelService'
import type { CommodityId, GameState } from '../types/game'
import PlanetVisual from '../components/ui/PlanetVisual'
import { planetStyle } from '../components/ui/planetStyle'
import GameBadge from '../components/ui/GameBadge'
import { StatTile } from '../components/ui/StatusChip'
import FloatingTransactions, {
  type TransactionFeedback,
} from '../components/ui/FloatingTransaction'
import {
  IconBlocked,
  IconCheck,
  IconClock,
  IconContract,
  IconLog,
  IconScroll,
  IconShip,
  IconTrade,
  IconTravel,
  IconWarning,
} from '../components/ui/Icons'

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

const TABS: { id: Tab; label: string; icon: typeof IconTrade }[] = [
  { id: 'market', label: 'Trade', icon: IconTrade },
  { id: 'travel', label: 'Travel', icon: IconTravel },
  { id: 'contracts', label: 'Contracts', icon: IconContract },
  { id: 'ship', label: 'Ship', icon: IconShip },
  { id: 'log', label: 'Log', icon: IconLog },
]

/**
 * The figures behind a trade, read off the same quote the trade services will
 * charge.
 *
 * A confirmation that only says "Bought 4 Food" leaves the two things a trader
 * actually wants - what the fill really cost, and what the sale realised against
 * the basis it was bought at - back in the table. Every number here comes from
 * `quoteBuy`, `quoteSell` and `cargoBasisAt`, the same functions that settle the
 * trade, so nothing is a second opinion of a price.
 */
function tradeFeedback(
  state: GameState,
  id: CommodityId,
  qty: number,
  kind: 'buy' | 'sell',
): TransactionFeedback | null {
  const planet = PLANET_MAP[state.planetId]
  const commodity = COMMODITY_MAP[id]
  const listing = state.markets[state.planetId]?.[id]
  if (!planet || !commodity || !listing || qty <= 0) return null

  const eventScale = commodityEventScale(state.activeEvents, state.planetId, id, state.day)
  const listed = listing.price

  if (kind === 'buy') {
    const quote = quoteBuy(planet, commodity, listing, qty, state.day, eventScale)
    const owned = state.cargo[id]
    // The same averaged basis `buyCommodity` will book the position at.
    const basisBefore = state.costBasis[id] ?? quote.unitPrice
    const nextBasis = (basisBefore * owned + quote.cost) / (owned + qty)
    return {
      id: 0,
      kind,
      amount: -quote.cost,
      title: `Bought ${fmt(qty)} × ${commodity.name}`,
      headline: { text: `+${fmt(qty)} ${commodity.name}`, tone: 'info' },
      lines: [
        {
          label: 'Fill price',
          value: (
            <>
              {fmtMoney(quote.unitPrice)}/u
              {Math.round(quote.unitPrice) !== listed && (
                <span className="ml-1 text-slate-500">was {fmtMoney(listed)}</span>
              )}
            </>
          ),
          tone: quote.unitPrice > listed ? 'bad' : quote.unitPrice < listed ? 'good' : 'muted',
        },
        { label: 'New basis', value: `${fmtMoney(nextBasis)}/u`, tone: 'muted' },
      ],
    }
  }

  const quote = quoteSell(planet, commodity, listing, qty, state.day, eventScale)
  const basis = state.costBasis[id]
  const realised = quote.proceeds - (basis ?? 0) * qty
  return {
    id: 0,
    kind,
    amount: quote.proceeds,
    title: `Sold ${fmt(qty)} × ${commodity.name}`,
    // Only stated when the position has a real basis to compare against;
    // without one there is no profit to report, and inventing one would be a
    // lie about where the goods came from.
    headline:
      basis === undefined
        ? undefined
        : Math.round(realised) >= 0
          ? { text: `+${fmtMoney(Math.abs(realised))} profit`, tone: 'good' }
          : { text: `-${fmtMoney(-realised)} trading loss`, tone: 'bad' },
    lines: [
      {
        label: 'Fill price',
        value: (
          <>
            {fmtMoney(quote.unitPrice)}/u
            {Math.round(quote.unitPrice) !== listed && (
              <span className="ml-1 text-slate-500">was {fmtMoney(listed)}</span>
            )}
          </>
        ),
        tone: quote.unitPrice > listed ? 'good' : quote.unitPrice < listed ? 'bad' : 'muted',
      },
      ...(basis !== undefined
        ? [{ label: 'You paid', value: `${fmtMoney(basis)}/u`, tone: 'muted' as const }]
        : []),
    ],
  }
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
  const [receipts, setReceipts] = useState<TransactionFeedback[]>([])
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasVictory = useRef(false)
  const receiptId = useRef(0)

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
  const nw = netWorth(game)
  const holdValue = cargoSaleValue(game)
  const progress = goalProgress(game)
  const showVictory = game.stats.victory && !game.stats.victorySeen
  const upkeep = dailyUpkeep(game.ship)
  const canPayUpkeep = game.credits >= upkeep
  const dueHere = contractDests(game).get(game.planetId) ?? 0
  const eventsHere = eventsAt(game.activeEvents, game.planetId, game.day).length

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

  /**
   * Trades answer with a receipt rather than a line of text, and only on
   * success: a failed trade is an error and belongs in the error strip, while a
   * successful one has figures worth showing.
   */
  const runTrade = (
    fn: () => ActionResult,
    okSound: 'buy' | 'sell',
    id: CommodityId,
    qty: number,
  ): ActionResult => {
    const feedback = tradeFeedback(game, id, qty, okSound)
    const res = fn()
    if (res.ok) {
      sound[okSound]()
      if (feedback) {
        receiptId.current += 1
        setReceipts((prev) => [...prev.slice(-2), { ...feedback, id: receiptId.current }])
      }
    } else {
      sound.error()
      flashMessage(res.message, 'error')
    }
    return res
  }

  const expireReceipt = (id: number) => setReceipts((prev) => prev.filter((r) => r.id !== id))

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

  return (
    <Layout>
      <div className="space-y-4">
        {flash && (
          <div
            className={`toast-in flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium ${
              flash.kind === 'ok'
                ? 'border-emerald-700/50 bg-emerald-950/60 text-emerald-100'
                : 'border-rose-700/50 bg-rose-950/60 text-rose-100'
            }`}
            role="status"
          >
            {flash.kind === 'ok' ? (
              <IconCheck className="h-4 w-4 shrink-0" />
            ) : (
              <IconBlocked className="h-4 w-4 shrink-0" />
            )}
            <span>{flash.message}</span>
          </div>
        )}

        {/* Where the ship is, what it is worth, and the only button that is
            always worth having: let the day turn. Credits, cargo and the day
            live in the sticky header, so they are not repeated here. */}
        <section className="card relative overflow-hidden p-4">
          <div
            className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full"
            style={{ background: `radial-gradient(circle, ${planetStyle(planet).rim}33, transparent 68%)` }}
            aria-hidden="true"
          />
          <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4">
            <PlanetVisual
              planet={planet}
              size="lg"
              highlight="current"
              label={planet.name}
              className="m-5 sm:row-span-2"
            />
            <div className="min-w-0 self-end">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300/80">
                Docked at
              </div>
              <h1 className="text-2xl font-black leading-tight tracking-wide text-white">{planet.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <GameBadge tone="info" title={`${planet.type} world`}>
                  <IconPlanetType type={planet.type} className="h-3 w-3" />
                  {planet.type}
                </GameBadge>
                {dueHere > 0 && (
                  <GameBadge tone="contract" pulse title="You have cargo under contract bound for here">
                    <IconScroll className="h-3 w-3" />
                    {dueHere} {dueHere > 1 ? 'deliveries' : 'delivery'} due here
                  </GameBadge>
                )}
                {eventsHere > 0 && (
                  <GameBadge tone="warn" title="A market event is running here - see the Trade tab">
                    <IconWarning className="h-3 w-3" />
                    market alert
                  </GameBadge>
                )}
              </div>
            </div>
            <p className="col-span-2 self-start text-xs text-slate-400 sm:col-span-1 sm:col-start-2 sm:text-sm">
              {planet.description}
              <span className="num text-slate-500"> · pop {planet.population.toLocaleString()}</span>
            </p>
            <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:flex-col sm:items-end">
              <button
                onClick={() => runAction(() => waitDay(), 'wait')}
                title={
                  canPayUpkeep
                    ? undefined
                    : `Only ${game.credits} cr on hand - upkeep will be paid down to that.`
                }
                className="btn-ghost btn-sm flex flex-1 items-center justify-center gap-1.5 py-2 sm:flex-none"
              >
                <IconClock className="h-3.5 w-3.5" />
                Wait one day
              </button>
              <span
                className={`num shrink-0 text-[10px] ${canPayUpkeep ? 'text-slate-500' : 'text-amber-300'}`}
              >
                {fmtMoney(upkeep)} upkeep{canPayUpkeep ? '' : ', partial'}
              </span>
            </div>
          </div>

          <div className="relative mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="stat-tile text-left">
              <div className="flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-400">
                <span>Net worth</span>
                <span className={`whitespace-nowrap ${progress >= 1 ? 'font-bold text-emerald-300' : 'num'}`}>
                  {progress >= 1 ? (
                    'Trailblazer achieved!'
                  ) : (
                    <>
                      <span className="font-semibold text-indigo-200">{fmtPct(progress)}</span> of{' '}
                      {fmtMoney(GAME_TARGET_NET_WORTH)}
                    </>
                  )}
                </span>
              </div>
              <div className="num text-xl font-bold leading-tight text-indigo-100 text-glow">
                {fmtMoney(nw)}
              </div>
              <div
                className="meter mt-1.5 h-2"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                aria-label="Progress toward the trailblazer goal"
              >
                <div
                  className={`meter-fill bg-gradient-to-r ${
                    progress >= 1 ? 'from-emerald-400 to-cyan-300' : 'from-indigo-500 via-violet-400 to-cyan-300'
                  }`}
                  style={{ width: `${Math.max(1, Math.min(100, progress * 100))}%` }}
                />
              </div>
            </div>
            {/* Net worth counts cargo at cost, so this market figure is
                informational only and is labelled to say so. */}
            <StatTile
              label="Hold sells for"
              value={fmtMoney(holdValue)}
              tone="text-cyan-100"
              hint="here, today"
            />
          </div>
        </section>

        <nav
          className="grid grid-cols-5 gap-1 rounded-xl border border-slate-700/60 bg-slate-950/60 p-1 backdrop-blur-sm sm:flex sm:w-fit"
          aria-label="Game sections"
        >
          {TABS.map((t) => {
            const Icon = t.icon
            const on = tab === t.id
            // A dot for "something here wants you": a delivery to hand over, or
            // an event moving prices on this market.
            const dot =
              (t.id === 'contracts' && dueHere > 0) || (t.id === 'market' && eventsHere > 0)
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={on ? 'page' : undefined}
                className={`relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-semibold transition-colors sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
                  on
                    ? 'bg-gradient-to-b from-indigo-500/35 to-indigo-600/15 text-white shadow-[inset_0_0_0_1px_rgba(129,140,248,0.5),0_0_18px_-6px_rgba(99,102,241,0.9)]'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 ${on ? 'text-indigo-200' : ''}`} />
                {t.label}
                {dot && (
                  <span
                    className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${
                      t.id === 'contracts' ? 'bg-violet-400' : 'bg-amber-400'
                    } shadow-[0_0_8px_currentColor]`}
                    aria-hidden="true"
                  />
                )}
              </button>
            )
          })}
        </nav>

        {tab === 'market' && (
          <MarketPanel
            game={game}
            planet={planet}
            buy={(id, qty) => runTrade(() => buy(id, qty), 'buy', id, qty)}
            sell={(id, qty) => runTrade(() => sell(id, qty), 'sell', id, qty)}
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

      <FloatingTransactions items={receipts} onExpire={expireReceipt} />

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