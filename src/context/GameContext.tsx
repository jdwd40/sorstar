import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CommodityId, GameState, ShipUpgradeType } from '../types/game'
import { createGameStore, type AuthUser, type GameStore, type SessionLostReason } from '../services/gameStore'
import { advanceDay, buyCommodity, sellCommodity } from '../services/marketService'
import { travel as travelService, type TravelResult } from '../services/travelService'
import { buyUpgrade } from '../services/playerService'
import { createNewGame, netWorth, withLog } from '../services/gameService'
import { COMMODITY_MAP, GAME_TARGET_NET_WORTH, PLANET_MAP, dailyUpkeep } from '../data/gameData'

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
  pilotLost: SessionLostReason | null
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
  // Net worth alone is not an achievement: a ship bought outright with
  // starting credits clears the bar without ever trading. Require actual
  // realised profit from sales on top of the headline number.
  if (
    nw >= GAME_TARGET_NET_WORTH &&
    stats.goodsSold > 0 &&
    stats.totalProfit > 0 &&
    !stats.victory
  ) {
    stats = { ...stats, victory: true, victorySeen: false, victoryDay: next.day }
  }
  if (stats === next.stats) return next
  return { ...next, stats }
}

function logProfit(profit: number): string {
  const p = Math.round(profit)
  return p >= 0 ? ` (+${p} cr profit)` : ` (${p} cr)`
}

/** " at Korbant Reach" for a state's current planet, or nothing if unknown. */
function atPlanet(state: GameState): string {
  const planet = PLANET_MAP[state.planetId]
  return planet ? ` at ${planet.name}` : ''
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<GameState | null>(null)
  const [ready, setReady] = useState(false)
  const [loadNonce, setLoadNonce] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [persistError, setPersistError] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [pilotLost, setPilotLost] = useState<SessionLostReason | null>(null)
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
    store.onPilotLost = (reason) => setPilotLost(reason)
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

/**
 * The shared spine of every player action: guard against "no active game", run
 * a pure service function, surface its error verbatim, then commit the result
 * with a log line.
 *
 * Each action supplies only what makes it distinct - how it runs, what its log
 * says, and what success reads like. Without this, the same six lines were
 * copy-pasted across buy/sell/wait/travel/upgrade, and they had already drifted:
 * the buy and sell logs were each deriving trade totals from a listed price
 * instead of the credits that actually moved.
 */
const apply = useCallback(
  <R extends { state: GameState; error?: string }>(
    run: (state: GameState) => R,
    log: (before: GameState, after: GameState, result: R) => { icon: string; text: string },
    done: (after: GameState, result: R) => { message: string; info?: TravelResult },
    precheck?: (state: GameState) => string | null,
  ): ActionResult => {
    const before = gameRef.current
    if (!before) return { ok: false, message: 'No active game.' }
    const blocked = precheck?.(before)
    if (blocked) return { ok: false, message: blocked }
    const result = run(before)
    if (result.error) return { ok: false, message: result.error }
    const { icon, text } = log(before, result.state, result)
    commit(withLog(result.state, icon, text))
    const { message, info } = done(result.state, result)
    return info ? { ok: true, message, info } : { ok: true, message }
  },
  [commit],
)

  const buy = useCallback(
    (commodityId: CommodityId, qty: number): ActionResult =>
      apply(
        (state) => buyCommodity(state, commodityId, qty),
        (before, after) => ({
          icon: '🛒',
          // Sum from the credits that moved: buying shifts the market, so the
          // pre-trade listed price is not what was paid.
          text: `Bought ${qty}× ${COMMODITY_MAP[commodityId].name} for ${
            before.credits - after.credits
          } cr${atPlanet(after)}.`,
        }),
        () => ({ message: 'Purchase complete.' }),
      ),
    [apply],
  )

  const sell = useCallback(
    (commodityId: CommodityId, qty: number): ActionResult =>
      apply(
        (state) => sellCommodity(state, commodityId, qty),
        (before, after) => {
          // Same basis the store used to record the profit: pre-sale cost
          // basis, since the post-sale state may have dropped it when the
          // position sold out completely.
          const basis =
            before.costBasis[commodityId] ??
            before.markets[before.planetId][commodityId].price
          const earned = after.credits - before.credits
          return {
            icon: '💰',
            text: `Sold ${qty}× ${COMMODITY_MAP[commodityId].name} for ${earned} cr${atPlanet(
              after,
            )}${logProfit(earned - basis * qty)}.`,
          }
        },
        () => ({ message: 'Sale complete.' }),
      ),
    [apply],
  )

  const waitDay = useCallback(
    (): ActionResult =>
      apply(
        (state) => {
          // Charge what the ship can actually pay. Refusing the wait outright
          // would brick a player who has run out of credits *and* cargo: they
          // cannot pay upkeep, cannot sell anything, and cannot afford fuel.
          // Paying a partial bill keeps waiting available and never goes
          // negative; once they sell, the full rate resumes.
          const charged = Math.min(dailyUpkeep(state.ship), state.credits)
          return {
            state: { ...advanceDay(state), credits: state.credits - charged },
            charged,
          }
        },
        (_before, after, r) => ({
          icon: '🌓',
          text: `A day passes${atPlanet(after)}. Markets re-open.${
            r.charged > 0 ? ` Upkeep: -${r.charged} cr.` : ' Upkeep unpaid.'
          }`,
        }),
        (after) => ({ message: `Day ${after.day} begins.` }),
      ),
    [apply],
  )

  const travel = useCallback(
    (destId: string): ActionResult =>
      apply(
        (state) => travelService(state, destId),
        (_before, _after, r) => ({
          icon: '🚀',
          text: `Jumped ${r.distanceLy} ly from ${r.fromName} to ${r.toName} (${r.fuelCost} cr fuel, ${
            r.days ?? 0
          } day${(r.days ?? 0) > 1 ? 's' : ''}).`,
        }),
        (_after, r) => ({ message: `Arrived at ${r.toName}.`, info: r }),
      ),
    [apply],
  )

  const travelUpgrade = useCallback(
    (type: ShipUpgradeType): ActionResult =>
      apply(
        (state) => buyUpgrade(state, type),
        (_before, _after, r) => ({
          icon: '🧰',
          text: r.upgradeName ? `${r.upgradeName} installed.` : 'Ship upgraded.',
        }),
        (_after, r) => ({
          message: r.upgradeName ? `${r.upgradeName} installed.` : 'Upgrade complete.',
        }),
      ),
    [apply],
  )

  const dismissPilotLost = useCallback(() => setPilotLost(null), [])

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