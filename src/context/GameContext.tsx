import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CommodityId, GameState, ShipUpgradeType } from '../types/game'
import { createGameStore, type GameStore } from '../services/gameStore'
import { advanceDay, buyCommodity, sellCommodity } from '../services/marketService'
import { travel as travelService, type TravelResult } from '../services/travelService'
import { buyUpgrade } from '../services/playerService'
import { createNewGame, netWorth, withLog } from '../services/gameService'
import { COMMODITY_MAP, GAME_TARGET_NET_WORTH, PLANET_MAP } from '../data/gameData'

export interface ActionResult {
  ok: boolean
  message: string
  info?: TravelResult
}

interface GameContextValue {
  game: GameState | null
  saveExists: boolean
  ready: boolean
  startNewGame: () => void
  continueGame: () => void
  resetGame: () => void
  dismissVictory: () => void
  buy: (commodityId: CommodityId, qty: number) => ActionResult
  sell: (commodityId: CommodityId, qty: number) => ActionResult
  waitDay: () => ActionResult
  travel: (destId: string) => ActionResult
  travelUpgrade: (type: ShipUpgradeType) => ActionResult
}

const GameContext = createContext<GameContextValue | undefined>(undefined)

export { GameContext }

function stampProgress(next: GameState): GameState {
  const nw = netWorth(next)
  let stats = next.stats
  if (nw > stats.maxNetWorth) {
    stats = { ...stats, maxNetWorth: nw }
  }
  if (nw >= GAME_TARGET_NET_WORTH && !stats.victory) {
    stats = { ...stats, victory: true, victorySeen: false, victoryDay: next.day }
  }
  if (stats === next.stats) return next
  return { ...next, stats }
}

function logPush(state: GameState, icon: string, text: string): GameState {
  return withLog(state, icon, text)
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<GameState | null>(null)
  const [saveExists, setSaveExists] = useState(false)
  const [ready, setReady] = useState(false)
  const storeRef = useRef<GameStore>(createGameStore())
  const gameRef = useRef<GameState | null>(null)

  useEffect(() => {
    const loaded = storeRef.current.load()
    if (loaded) {
      gameRef.current = stampProgress(loaded)
      setGame(stampProgress(loaded))
      setSaveExists(true)
    }
    setReady(true)
  }, [])

  const commit = useCallback((next: GameState) => {
    const stamped = stampProgress(next)
    gameRef.current = stamped
    setGame(stamped)
    storeRef.current.save(stamped)
  }, [])

  const startNewGame = useCallback(() => {
    const next = createNewGame()
    gameRef.current = next
    setGame(next)
    setSaveExists(true)
    storeRef.current.save(next)
  }, [])

  const continueGame = useCallback(() => {
    if (gameRef.current) {
      setGame(gameRef.current)
    }
  }, [])

  const resetGame = useCallback(() => {
    storeRef.current.clear()
    gameRef.current = null
    setGame(null)
    setSaveExists(false)
  }, [])

  const dismissVictory = useCallback(() => {
    if (!gameRef.current) return
    commit({ ...gameRef.current, stats: { ...gameRef.current.stats, victorySeen: true } })
  }, [commit])

  const buy = useCallback(
    (commodityId: CommodityId, qty: number): ActionResult => {
      if (!gameRef.current) return { ok: false, message: 'No active game.' }
      const result = buyCommodity(gameRef.current, commodityId, qty)
      if (result.error) return { ok: false, message: result.error }
      const stateBefore = gameRef.current
      const commodity = COMMODITY_MAP[commodityId]
      const planet = PLANET_MAP[result.state.planetId]
      const pricePaid = stateBefore.markets[stateBefore.planetId][commodityId].price
      commit(
        logPush(
          result.state,
          '🛒',
          `Bought ${qty}× ${commodity.name} for ${qty * pricePaid} cr${planet ? ` at ${planet.name}` : ''}.`,
        ),
      )
      return { ok: true, message: 'Purchase complete.' }
    },
    [commit],
  )

  const sell = useCallback(
    (commodityId: CommodityId, qty: number): ActionResult => {
      if (!gameRef.current) return { ok: false, message: 'No active game.' }
      const result = sellCommodity(gameRef.current, commodityId, qty)
      if (result.error) return { ok: false, message: result.error }
      const stateBefore = gameRef.current
      const commodity = COMMODITY_MAP[commodityId]
      const basis = stateBefore.costBasis[commodityId] ?? 0
      const price = stateBefore.markets[stateBefore.planetId][commodityId].price
      const profit = (price - basis) * qty
      const planet = PLANET_MAP[result.state.planetId]
      commit(
        logPush(
          result.state,
          '💰',
          `Sold ${qty}× ${commodity.name} for ${qty * price} cr${planet ? ` at ${planet.name}` : ''}${profit >= 0 ? ` (+${profit} cr profit)` : ` (${profit} cr)`}.`,
        ),
      )
      return { ok: true, message: 'Sale complete.' }
    },
    [commit],
  )

  const waitDay = useCallback((): ActionResult => {
    if (!gameRef.current) return { ok: false, message: 'No active game.' }
    const state = gameRef.current
    const planet = PLANET_MAP[state.planetId]
    commit(logPush(advanceDay(state), '🌓', `A day passes at ${planet ? planet.name : 'orbit'}. Markets re-open.`))
    return { ok: true, message: `Day ${state.day + 1} begins.` }
  }, [commit])

  const travel = useCallback(
    (destId: string): ActionResult => {
      if (!gameRef.current) return { ok: false, message: 'No active game.' }
      const result = travelService(gameRef.current, destId)
      if (result.error) return { ok: false, message: result.error }
      commit(
        logPush(
          result.state,
          '🚀',
          `Jumped ${result.distanceLy} ly from ${result.fromName} to ${result.toName} (${result.fuelCost} cr fuel, ${result.days} day${(result.days ?? 0) > 1 ? 's' : ''}).`,
        ),
      )
      return { ok: true, message: `Arrived at ${result.toName}.`, info: result }
    },
    [commit],
  )

  const travelUpgrade = useCallback(
    (type: ShipUpgradeType): ActionResult => {
      if (!gameRef.current) return { ok: false, message: 'No active game.' }
      const result = buyUpgrade(gameRef.current, type)
      if (result.error || !result.state) return { ok: false, message: result.error ?? 'Upgrade failed.' }
      commit(
        logPush(
          result.state,
          '🧰',
          result.upgradeName ? `${result.upgradeName} installed.` : 'Ship upgraded.',
        ),
      )
      return { ok: true, message: result.upgradeName ? `${result.upgradeName} installed.` : 'Upgrade complete.' }
    },
    [commit],
  )

  const value = useMemo<GameContextValue>(
    () => ({
      game,
      saveExists,
      ready,
      startNewGame,
      continueGame,
      resetGame,
      dismissVictory,
      buy,
      sell,
      waitDay,
      travel,
      travelUpgrade,
    }),
    [
      game,
      saveExists,
      ready,
      startNewGame,
      continueGame,
      resetGame,
      dismissVictory,
      buy,
      sell,
      waitDay,
      travel,
      travelUpgrade,
    ],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGame(): GameContextValue {
  const context = useContext(GameContext)
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}