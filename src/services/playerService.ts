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
  upgradeName?: string
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
  switch (type) {
    case 'cargo':
      ship = { ...ship, cargoLevel: ship.cargoLevel + 1 }
      upgradeName = `Cargo Hold Lv${ship.cargoLevel} (+${cargoCapacityAtLevel(ship.cargoLevel)} units)`
      break
    case 'engine':
      ship = { ...ship, engineLevel: ship.engineLevel + 1 }
      upgradeName = `Warp Engine Lv${ship.engineLevel} (${fuelCostAtLevel(ship.engineLevel)} cr/ly)`
      break
    case 'nav':
      ship = { ...ship, navLevel: ship.navLevel + 1 }
      upgradeName = 'Navigation Array'
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
  }
}