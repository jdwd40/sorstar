import type { GameState, MarketListing } from '../types/game'
import { GAME_VERSION } from '../data/gameData'

export function migrate(raw: GameState): GameState {
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