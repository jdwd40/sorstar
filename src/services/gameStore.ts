import type { GameState } from '../types/game'
import { SAVE_KEY } from '../data/gameData'
import { migrate } from './migrate'
import { PocketBaseGameStore } from './pocketBaseStore'

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

export interface GameStore {
  load(): Promise<GameState | null>
  save(state: GameState): Promise<void>
  clear(): Promise<void>
  readonly auth: AuthStore | null
}

export class LocalStorageGameStore implements GameStore {
  constructor(private readonly key: string = SAVE_KEY) {}

  readonly auth = null

  async load(): Promise<GameState | null> {
    try {
      const raw = window.localStorage.getItem(this.key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as GameState
      if (!parsed || typeof parsed !== 'object' || parsed.version == null) {
        return null
      }
      return migrate(parsed)
    } catch {
      return null
    }
  }

  async save(state: GameState): Promise<void> {
    try {
      window.localStorage.setItem(this.key, JSON.stringify(state))
    } catch {
      // Storage may be unavailable (e.g. private mode) - fail silently.
    }
  }

  async clear(): Promise<void> {
    try {
      window.localStorage.removeItem(this.key)
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