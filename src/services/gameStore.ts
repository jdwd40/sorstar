import type { GameState, MarketListing } from '../types/game'
import { GAME_VERSION, SAVE_KEY } from '../data/gameData'

function migrate(raw: GameState): GameState {
  let state = { ...raw }

  if (state.version < 2) {
    const markets: GameState['markets'] = {}
    for (const [pid, record] of Object.entries(state.markets)) {
      const next: Record<string, MarketListing> = {}
      for (const [cid, listing] of Object.entries(record)) {
        next[cid] = { ...listing, prevPrice: listing.price }
      }
      markets[pid] = next as GameState['markets'][string]
    }
    state = {
      ...state,
      version: 2,
      markets,
      log: Array.isArray(state.log) ? state.log : [],
      stats: {
        ...state.stats,
        maxNetWorth: state.stats.maxNetWorth ?? 0,
        victory: state.stats.victory ?? false,
        victorySeen: state.stats.victorySeen ?? false,
        victoryDay: state.stats.victoryDay ?? null,
      },
    }
  }

  if (state.version < GAME_VERSION) {
    state = { ...state, version: GAME_VERSION }
  }
  return state
}

export interface GameStore {
  load(): GameState | null
  save(state: GameState): void
  clear(): void
}

export class LocalStorageGameStore implements GameStore {
  constructor(private readonly key: string = SAVE_KEY) {}

  load(): GameState | null {
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

  save(state: GameState): void {
    try {
      window.localStorage.setItem(this.key, JSON.stringify(state))
    } catch {
      // Storage may be unavailable (e.g. private mode) - fail silently.
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(this.key)
    } catch {
      // noop
    }
  }
}

export function createGameStore(): GameStore {
  return new LocalStorageGameStore()
}