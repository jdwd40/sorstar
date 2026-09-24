import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CommodityId, GameState, ShipUpgradeType } from '../types/game'
import { createGameStore, type AuthUser, type GameStore } from '../services/gameStore'
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
  ready: boolean
  loadError: boolean
  persistError: boolean
  pilotLost: boolean
  dismissPilotLost: () => void
  retryLoad: () => void
  authUser: AuthUser | null
  authAvailable: boolean
  authBusy: boolean
  login: (email: string, password: string) => Promise<string | null>
  register: (email: string, password: string, name?: string) => Promise<string | null>
  logout: () => Promise<void>
  startNewGame: () => void
  resetGame: () => void
  dismissVictory: () => void
  buy: (commodityId: CommodityId, qty: number) => ActionResult
  sell: (commodityId: CommodityId, qty: number) => ActionResult
  waitDay: () => ActionResult
  travel: (destId: string) => ActionResult
  travelUpgrade: (type: ShipUpgradeType) => ActionResult
}

const GameContext = createContext<GameContextValue | undefined>(undefined)

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

function logProfit(profit: number): string {
  const p = Math.round(profit)
  return p >= 0 ? ` (+${p} cr profit)` : ` (${p} cr)`
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<GameState | null>(null)
  const [ready, setReady] = useState(false)
  const [loadNonce, setLoadNonce] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [persistError, setPersistError] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [pilotLost, setPilotLost] = useState(false)
  const [externalChange, setExternalChange] = useState(0)
  const storeRef = useRef<GameStore | null>(null)
  if (storeRef.current === null) storeRef.current = createGameStore()
  const store = storeRef.current
  const gameRef = useRef<GameState | null>(null)
  const [authUser, setAuthUser] = useState<AuthUser | null>(store.auth?.user ?? null)
  // Monotonic token so a slower/older load() can never overwrite the result of
  // a newer one (e.g. the mount-time load resolving after a login reloads).
  const loadTokenRef = useRef(0)

  useEffect(() => {
    store.onPilotLost = () => setPilotLost(true)
    store.onExternalChange = () => setExternalChange((n) => n + 1)
    return () => {
      store.onPilotLost = undefined
      store.onExternalChange = undefined
    }
  }, [store])

  useEffect(() => {
    let active = true
    const token = ++loadTokenRef.current
    ;(async () => {
      try {
        const loaded = await store.load()
        if (!active || token !== loadTokenRef.current) return
        if (loaded) {
          const stamped = stampProgress(loaded)
          gameRef.current = stamped
          setGame(stamped)
        } else {
          gameRef.current = null
          setGame(null)
        }
        setLoadError(false)
      } catch (err) {
        if (!active || token !== loadTokenRef.current) return
        console.error('Failed to load game:', err)
        setLoadError(true)
      } finally {
        if (active && token === loadTokenRef.current) setReady(true)
      }
    })()
    return () => {
      active = false
    }
  }, [loadNonce, store])

  const trackSave = useCallback((operation: Promise<void>, message: string) => {
    void operation
      .then(() => setPersistError(false))
      .catch((err: unknown) => {
        console.error(message, err)
        setPersistError(true)
      })
  }, [])

  const retryLoad = useCallback(() => {
    setLoadNonce((n) => n + 1)
  }, [])

  const commit = useCallback((next: GameState) => {
    const stamped = stampProgress(next)
    gameRef.current = stamped
    setGame(stamped)
    trackSave(store.save(stamped), 'Failed to save game:')
  }, [trackSave, store])

  const startNewGame = useCallback(() => {
    const next = createNewGame()
    gameRef.current = next
    setGame(next)
    trackSave(store.save(next), 'Failed to save game:')
  }, [trackSave, store])

  const resetGame = useCallback(() => {
    trackSave(store.clear(), 'Failed to clear save:')
    gameRef.current = null
    setGame(null)
  }, [trackSave, store])

  const reloadFromStore = useCallback(async () => {
    const token = ++loadTokenRef.current
    try {
      const loaded = await store.load()
      if (token !== loadTokenRef.current) return
      if (loaded) {
        const stamped = stampProgress(loaded)
        gameRef.current = stamped
        setGame(stamped)
      } else {
        gameRef.current = null
        setGame(null)
      }
      setLoadError(false)
    } catch (err) {
      if (token !== loadTokenRef.current) return
      console.error('Failed to reload game:', err)
      setLoadError(true)
      // Keep the in-memory game: we don't know what the server holds, and
      // clearing it here would throw away the player's current session.
    } finally {
      if (token === loadTokenRef.current) setReady(true)
    }
  }, [store])

  // Another tab / device wrote the same save: reload so we track it instead of
  // silently last-write-wins over that progress.
  useEffect(() => {
    if (externalChange === 0) return
    void reloadFromStore()
  }, [externalChange, reloadFromStore])

  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!store.auth) return 'Accounts are only available with a PocketBase backend.'
      setAuthBusy(true)
      try {
        const err = await store.auth.login(email, password)
        if (err) return err
        setAuthUser(store.auth.user)
        await reloadFromStore()
        return null
      } finally {
        setAuthBusy(false)
      }
    },
    [reloadFromStore, store.auth],
  )

  const register = useCallback(
    async (email: string, password: string, name?: string): Promise<string | null> => {
      if (!store.auth) return 'Accounts are only available with a PocketBase backend.'
      setAuthBusy(true)
      try {
        const err = await store.auth.register(email, password, name)
        if (err) return err
        setAuthUser(store.auth.user)
        if (gameRef.current) {
          // Push the current save onto the new account so registration never
          // leaves the account without the browser's game (adoption inside the
          // store is only a fallback for the case where nothing is loaded yet).
          trackSave(store.save(gameRef.current), 'Failed to save game:')
        } else {
          // No in-memory game: pull whatever the account holds (maybe nothing).
          await reloadFromStore()
        }
        return null
      } finally {
        setAuthBusy(false)
      }
    },
    [trackSave, store, reloadFromStore],
  )

  const logout = useCallback(async () => {
    if (!store.auth) return
    setAuthBusy(true)
    try {
      await store.auth.logout()
      setAuthUser(null)
      // Switching identities means the in-memory game belongs to the previous
      // account, so reload from the (fresh) anonymous identity.
      await reloadFromStore()
    } finally {
      setAuthBusy(false)
    }
  }, [reloadFromStore, store.auth])

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
        withLog(
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
      const commodity = COMMODITY_MAP[commodityId]
      const priceNow = result.state.markets[result.state.planetId][commodityId].price
      const basis = result.state.costBasis[commodityId] ?? priceNow
      const profit = (priceNow - basis) * qty
      const planet = PLANET_MAP[result.state.planetId]
      commit(
        withLog(
          result.state,
          '💰',
          `Sold ${qty}× ${commodity.name} for ${qty * priceNow} cr${planet ? ` at ${planet.name}` : ''}${logProfit(profit)}.`,
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
    commit(withLog(advanceDay(state), '🌓', `A day passes at ${planet ? planet.name : 'orbit'}. Markets re-open.`))
    return { ok: true, message: `Day ${state.day + 1} begins.` }
  }, [commit])

  const travel = useCallback(
    (destId: string): ActionResult => {
      if (!gameRef.current) return { ok: false, message: 'No active game.' }
      const result = travelService(gameRef.current, destId)
      if (result.error) return { ok: false, message: result.error }
      commit(
        withLog(
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
        withLog(
          result.state,
          '🧰',
          result.upgradeName ? `${result.upgradeName} installed.` : 'Ship upgraded.',
        ),
      )
      return { ok: true, message: result.upgradeName ? `${result.upgradeName} installed.` : 'Upgrade complete.' }
    },
    [commit],
  )

  const dismissPilotLost = useCallback(() => setPilotLost(false), [])

  const value = useMemo<GameContextValue>(
    () => ({
      game,
      ready,
      loadError,
      persistError,
      pilotLost,
      dismissPilotLost,
      retryLoad,
      authUser,
      authAvailable: store.auth !== null,
      authBusy,
      login,
      register,
      logout,
      startNewGame,
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
      ready,
      loadError,
      persistError,
      pilotLost,
      dismissPilotLost,
      retryLoad,
      authUser,
      store.auth,
      authBusy,
      login,
      register,
      logout,
      startNewGame,
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