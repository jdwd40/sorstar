import type { GameState, ShipUpgradeType } from '../types/game'
import {
  CARGO_UPGRADES,
  ENGINE_UPGRADES,
  NAV_UPGRADES,
  cargoCapacityAtLevel,
  fuelCostAtLevel,
} from '../data/gameData'

export interface UpgradeResult {
  state: GameState
  error?: string
  applied?: boolean
  /** e.g. "Cargo Hold Lv1". */
  upgradeName?: string
  /**
   * What the upgrade actually changed, e.g. "20 units (+8)".
   *
   * Kept separate from the name because the two are different claims. An
   * upgrade that grew the hold from 12 to 20 added 8 units and now *holds* 20;
   * reporting the total as the addition told the player they had gained 20 when
   * they had gained 8, and made every later tier look like a windfall too.
   */
  upgradeDetail?: string
}

export function nextUpgradeCost(state: GameState, type: ShipUpgradeType): number {
  switch (type) {
    case 'cargo': {
      const next = CARGO_UPGRADES.find((t) => t.level === state.ship.cargoLevel + 1)
      return next ? next.cost : 0
    }
    case 'engine': {
      const next = ENGINE_UPGRADES.find((t) => t.level === state.ship.engineLevel + 1)
      return next ? next.cost : 0
    }
    case 'nav': {
      const next = NAV_UPGRADES.find((t) => t.level === state.ship.navLevel + 1)
      return next ? next.cost : 0
    }
  }
}

export function isMaxUpgrade(state: GameState, type: ShipUpgradeType): boolean {
  switch (type) {
    case 'cargo':
      return state.ship.cargoLevel >= CARGO_UPGRADES[CARGO_UPGRADES.length - 1].level
    case 'engine':
      return state.ship.engineLevel >= ENGINE_UPGRADES[ENGINE_UPGRADES.length - 1].level
    case 'nav':
      return state.ship.navLevel >= NAV_UPGRADES[NAV_UPGRADES.length - 1].level
  }
}

export function buyUpgrade(state: GameState, type: ShipUpgradeType): UpgradeResult {
  if (isMaxUpgrade(state, type)) {
    return { state, error: 'Already fully upgraded.' }
  }
  const cost = nextUpgradeCost(state, type)
  if (cost <= 0) return { state, error: 'No further upgrades available.' }
  if (state.credits < cost) {
    return { state, error: `Not enough credits (${cost} cr required).` }
  }

  let ship = state.ship
  let upgradeName = ''
  let upgradeDetail = ''
  switch (type) {
    case 'cargo': {
      const from = ship.cargoLevel
      ship = { ...ship, cargoLevel: from + 1 }
      const before = cargoCapacityAtLevel(from)
      const after = cargoCapacityAtLevel(ship.cargoLevel)
      upgradeName = `Cargo Hold Lv${ship.cargoLevel}`
      // New total first, then what it gained. `(+${after})` read as "you just
      // got 20 units" for a tier that only adds 8.
      upgradeDetail = `${after} units (+${after - before})`
      break
    }
    case 'engine': {
      const from = ship.engineLevel
      ship = { ...ship, engineLevel: from + 1 }
      upgradeName = `Warp Engine Lv${ship.engineLevel}`
      // Fuel only ever falls, so state the tier it came down from rather than
      // leaving the player to work it out from the Ship tab.
      upgradeDetail = `${fuelCostAtLevel(ship.engineLevel)} cr/ly (was ${fuelCostAtLevel(from)})`
      break
    }
    case 'nav':
      ship = { ...ship, navLevel: ship.navLevel + 1 }
      upgradeName = `Navigation Array Lv${ship.navLevel}`
      upgradeDetail = 'market intel online'
      break
  }

  return {
    state: {
      ...state,
      credits: state.credits - cost,
      ship,
      stats: {
        ...state.stats,
        upgradesInvested: state.stats.upgradesInvested + cost,
      },
    },
    applied: true,
    upgradeName,
    upgradeDetail,
  }
}

/**
 * One sentence for the log and the toast, so the two cannot drift.
 *
 * These had each grown their own inline ternary over `upgradeName`, which is
 * how the cargo tier ended up saying "20 units installed" in one place and
 * "(+20 units)" in the other.
 */
export function describeUpgrade(result: UpgradeResult): string {
  if (!result.upgradeName) return 'Ship upgraded.'
  return result.upgradeDetail
    ? `Installed ${result.upgradeName} — ${result.upgradeDetail}.`
    : `Installed ${result.upgradeName}.`
}