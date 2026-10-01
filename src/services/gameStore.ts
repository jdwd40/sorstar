import type { CommodityId, GameState, Ship } from '../types/game'
import { COMMODITIES, SAVE_KEY } from '../data/gameData'
import { migrate } from './migrate'
import { PocketBaseGameStore } from './pocketBaseStore'

const LEGACY_SAVE_KEY = 'sorstar.save.v1'

const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n)

function isValidCargo(cargo: unknown): cargo is GameState['cargo'] {
  if (!cargo || typeof cargo !== 'object') return false
  const c = cargo as Record<CommodityId, unknown>
  return COMMODITIES.every(({ id }) => isFiniteNumber(c[id]))
}

function isValidShip(ship: unknown): ship is Ship {
  if (!ship || typeof ship !== 'object') return false
  const s = ship as Record<string, unknown>
  return (
    isFiniteNumber(s.cargoLevel) &&
    isFiniteNumber(s.engineLevel) &&
    isFiniteNumber(s.navLevel)
  )
}

function isValidState(raw: unknown): raw is GameState {
  if (!raw || typeof raw !== 'object') return false
  const s = raw as GameState
  return (
    isFiniteNumber(s.version) &&
    isFiniteNumber(s.day) &&
    isFiniteNumber(s.credits) &&
    typeof s.planetId === 'string' &&
    isValidShip(s.ship) &&
    isValidCargo(s.cargo) &&
    !!s.markets && typeof s.markets === 'object' &&
    !!s.stats && typeof s.stats === 'object'
  )
}

export interface AuthUser {
  id: string
  email: string
  name: string
}

/**
 * Optional account layer on top of a GameStore. Null on stores that have no
 * server-side identity (e.g. localStorage-only mode).
 */
export interface AuthStore {
  /** The registered account currently signed in, or null when playing anonymously. */
  readonly user: AuthUser | null
  /**
   * Creates an account, signs into it and adopts the current anonymous/browser
   * save if the new account has none. Resolves with an error message on failure.
   */
  register(email: string, password: string, name?: string): Promise<string | null>
  /**
   * Signs into an existing account, adopting the current anonymous/browser save
   * if the account has none. Resolves with an error message on failure.
   */
  login(email: string, password: string): Promise<string | null>
  /** Signs out, returning the store to anonymous mode. */
  logout(): Promise<void>
}

/**
 * Which identity could not be restored on session recovery.
 *
 * - `pilot`: the anonymous pilot is gone; its saved game is unreachable.
 * - `account`: a registered account's session could not be resumed. The
 *   account itself is untouched - only the browser's session was - so the
 *   player can get back to it by signing in again.
 */
export type SessionLostReason = 'pilot' | 'account'

export interface GameStore {
  load(): Promise<GameState | null>
  save(state: GameState): Promise<void>
/**
   * Wipes the current save - the local backup and, when signed in, the remote
   * record - but leaves the account and pilot identity intact. It does NOT log
   * out; use `auth.logout()` for that.
   */
  clear(): Promise<void>
  /**
   * Fired when the active identity is unrecoverable and a fresh anonymous
   * pilot has been minted in its place, so the game stays playable. The reason
   * tells the UI whether this is unrecoverable progress loss (`pilot`) or a
   * recoverable sign-in problem (`account`).
   */
  onPilotLost?: (reason: SessionLostReason) => void
  /**
   * Fired when the underlying save changed outside this store instance (e.g.
   * another tab wrote the same local save / account). Consumers can reload.
   */
  onExternalChange?: () => void
  readonly auth: AuthStore | null
}

class LocalStorageGameStore implements GameStore {
  onExternalChange?: () => void

  constructor(private readonly key: string = SAVE_KEY) {
    if (typeof window !== 'undefined') {
      // Cross-tab sync: another tab writing or clearing the same save (or
      // clearing all storage) should be picked up instead of silently losing
      // the last-write-wins race.
      window.addEventListener('storage', (e) => {
        if (e.key === this.key || e.key === null) this.onExternalChange?.()
      })
    }
  }

  readonly auth = null

  async load(): Promise<GameState | null> {
    try {
      let raw = window.localStorage.getItem(this.key)
      let fromLegacy = false
      if (!raw) {
        raw = window.localStorage.getItem(LEGACY_SAVE_KEY)
        fromLegacy = raw !== null
      }
      if (!raw) return null
      const parsed = JSON.parse(raw) as unknown
      if (!isValidState(parsed)) {
        console.error('[sorstar] Ignoring invalid or corrupt save.')
        return null
      }
      const migrated = migrate(parsed)
      if (fromLegacy || migrated !== parsed) {
        this.save(migrated)
      }
      return migrated
    } catch (err) {
      console.error('[sorstar] Failed to load save:', err)
      return null
    }
  }

  async save(state: GameState): Promise<void> {
    try {
      window.localStorage.setItem(this.key, JSON.stringify(state))
      // The legacy key has served its migration purpose; drop it so a later
      // clear()/reset cannot resurrect the old copy through the fallback.
      window.localStorage.removeItem(LEGACY_SAVE_KEY)
    } catch {
      // Storage may be unavailable (e.g. private mode) - fail silently.
    }
  }

  async clear(): Promise<void> {
    try {
      window.localStorage.removeItem(this.key)
      window.localStorage.removeItem(LEGACY_SAVE_KEY)
    } catch {
      // noop
    }
  }
}

export function createGameStore(): GameStore {
  const pbUrl = import.meta.env.VITE_PB_URL as string | undefined
  if (pbUrl) {
    return new PocketBaseGameStore(pbUrl)
  }
  return new LocalStorageGameStore()
}