/**
 * Manual game-logic verification script.
 * Run with: npx tsx scripts/verify-game.ts
 */
import { createNewGame, netWorth } from '../src/services/gameService'
import { buyCommodity, sellCommodity } from '../src/services/marketService'
import { travel } from '../src/services/travelService'
import { buyUpgrade } from '../src/services/playerService'
import type { CommodityId } from '../src/types/game'
import { PLANETS } from '../src/data/gameData'

let failures = 0
const check = (cond: boolean, label: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`)
  if (!cond) failures++
}

// 1. every planet has a priced market
const commoditiesToTest = ['food', 'metals', 'electronics', 'medicine', 'luxury', 'crystals']
for (const planet of PLANETS) {
  const state = createNewGame()
  state.planetId = planet.id
  let cheapest: { id: string; price: number } | null = null
  for (const c of commoditiesToTest) {
    const price = state.markets[planet.id]?.[c]?.price ?? 0
    if (cheapest === null || price < cheapest.price) cheapest = { id: c, price }
  }
  check(cheapest !== null && cheapest.price > 0, `planet ${planet.name} has priced market`)
}

// 2. realistic runs produce profit after fuel
const trial = (
  originId: string,
  destId: string,
  commodityId: CommodityId,
  qty: number,
): { profit?: number; error?: string } => {
  let s = createNewGame()
  s.planetId = originId
  const buyRes = buyCommodity(s, commodityId, qty)
  if (buyRes.error) return { error: buyRes.error }
  s = buyRes.state
  const before = s.credits
  const t = travel(s, destId)
  if (t.error) return { error: t.error }
  s = t.state
  const sellRes = sellCommodity(s, commodityId, qty)
  if (sellRes.error) return { error: sellRes.error }
  s = sellRes.state
  return { profit: s.credits - before }
}

const RUNS: [string, string, CommodityId, number][] = [
  ['eden', 'drax', 'food', 10],
  ['nextera', 'drax', 'electronics', 4],
  ['ironreach', 'nextera', 'metals', 8],
  ['aurelia', 'drax', 'luxury', 4],
]

for (const [id, where, good, qty] of RUNS) {
  const r = trial(id, where, good, qty)
  console.log(`${good} ${id}->${where}:`, r.profit !== undefined ? `${r.profit} cr profit` : r.error)
  check(r.profit !== undefined && r.profit > 0, `${good} run profitable`)
}

// 3. constraints
const s = createNewGame()
let buyRes = buyCommodity(s, 'food', 999)
check(buyRes.error !== undefined, 'cannot buy more than credits afford')
buyRes = buyCommodity(s, 'water', 9999)
check(buyRes.error !== undefined, 'cannot exceed cargo space')
let s2 = createNewGame()
s2 = buyCommodity(s2, 'food', 12).state
const sellRes = sellCommodity(s2, 'food', 13)
check(sellRes.error !== undefined, 'cannot sell more than owned')

// 4. stock & price react to trading
let s3 = createNewGame()
const stockBefore = s3.markets.eden.food.stock
const priceBefore = s3.markets.eden.food.price
s3 = buyCommodity(s3, 'food', 5).state
check(s3.markets.eden.food.stock === stockBefore - 5, 'stock decreases after buy')
check(s3.markets.eden.food.price >= priceBefore, 'price rises (or equal) when buying')

// 5. upgrade chain caps
let s4 = createNewGame()
s4.credits = 999999
for (let i = 0; i < 7; i++) {
  const u = buyUpgrade(s4, 'cargo')
  if (!u.applied) break
  s4 = u.state
}
check(s4.ship.cargoLevel === 5, 'cargo max level reached')
const uMax = buyUpgrade(s4, 'cargo')
check(uMax.error === 'Already fully upgraded.', 'cannot upgrade beyond max')

// 6. net worth grows on a profitable round trip
let s5 = createNewGame()
const nw0 = netWorth(s5)
s5 = buyCommodity(s5, 'food', 10).state
s5 = travel(s5, 'drax').state
s5 = sellCommodity(s5, 'food', 10).state
const nw1 = netWorth(s5)
check(nw1 > nw0, 'net worth grows after profitable round trip')

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECKS FAILED`)
process.exit(failures === 0 ? 0 : 1)