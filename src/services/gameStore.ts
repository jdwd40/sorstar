import type { GameState } from '../types/game'
import { SAVE_KEY } from '../data/gameData'
import { migrate } from './migrate'
import { PocketBaseGameStore } from './pocketBaseStore'

export interface GameStore {
  load(): Promise<GameState | null>
  save(state: GameState): Promise<void>
  clear(): Promise<void>
}

export class LocalStorageGameStore implements GameStore {
  constructor(private readonly key: string = SAVE_KEY) {}

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