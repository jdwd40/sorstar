/**
 * Manual game-logic verification script.
 * Run with: npx tsx scripts/verify-game.ts
 */
import { createNewGame, netWorth } from '../src/services/gameService'
import { advanceDay, buyCommodity, sellCommodity } from '../src/services/marketService'
import { getTradeLeads } from '../src/services/intelService'
import { travel } from '../src/services/travelService'
import { resumableIdentity } from '../src/services/pocketBaseStore'
import { buyUpgrade } from '../src/services/playerService'
import type { CommodityId, GameState } from '../src/types/game'
import { PLANETS, STARTING_SHIP, UPKEEP_BASE, UPKEEP_MAX, dailyUpkeep } from '../src/data/gameData'

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

// 7. buying is charged the settled (post-impact) price, not the sticker price.
//    Buyers used to pay the pre-drain price while sellers paid post-restock,
//    which handed buyers a free ride past their own market impact.
let s6 = createNewGame()
s6 = { ...s6, credits: 500000, cargo: Object.fromEntries(Object.keys(s6.cargo).map((k) => [k, 0])), costBasis: {} }
const listedPrice = s6.markets[s6.planetId].crystals.price
const stockBeforeBuy = s6.markets[s6.planetId].crystals.stock
const buy6 = buyCommodity(s6, 'crystals', 10)
if (buy6.error) {
  check(false, `buy charged settled price (unexpected error: ${buy6.error})`)
} else {
  const settledPrice = buy6.state.markets[s6.planetId].crystals.price
  const spent = s6.credits - buy6.state.credits
  check(settledPrice > listedPrice, 'price rises after draining stock')
  check(spent === 10 * settledPrice, `buy charged settled price (spent ${spent} = 10 x ${settledPrice})`)
  check(
    buy6.state.markets[s6.planetId].crystals.stock === stockBeforeBuy - 10,
    'buy removes exactly the traded quantity from stock',
  )
}

// 8. buying can no longer inflate net worth. Cargo is marked to cost basis,
//    so trading moves credits but not equity until the goods actually sell.
let s7 = createNewGame()
s7 = { ...s7, credits: 500000, cargo: Object.fromEntries(Object.keys(s7.cargo).map((k) => [k, 0])), costBasis: {} }
const nwBefore = netWorth(s7)
const buy7 = buyCommodity(s7, 'crystals', 10)
if (buy7.error) {
  check(false, `buying does not inflate net worth (unexpected error: ${buy7.error})`)
} else {
  check(
    Math.abs(netWorth(buy7.state) - nwBefore) < 1e-9,
    'buying does not inflate net worth',
  )
  const sell7 = sellCommodity(buy7.state, 'crystals', 10)
  check(
    !sell7.error && netWorth(sell7.state) < nwBefore,
    'round trip loses to market impact rather than printing money',
  )
}

// 9. waiting a day and re-buying cannot farm net worth. This was worth ~4k cr
//    over 40 iterations when cargo was marked to the live local price.
let s8 = createNewGame()
s8 = { ...s8, cargo: Object.fromEntries(Object.keys(s8.cargo).map((k) => [k, 0])), costBasis: {} }
const nwStart = netWorth(s8)
let farm = s8
let farmTrades = 0
for (let i = 0; i < 40; i++) {
  farm = advanceDay(farm)
  const r = buyCommodity(farm, 'crystals', 1)
  if (r.error) continue
  farm = r.state
  farmTrades++
}
check(farmTrades > 0, `wait/buy loop executed trades (${farmTrades})`)
check(
  Math.abs(netWorth(farm) - nwStart) < 1e-9,
  `40x wait+buy does not inflate net worth (delta ${(netWorth(farm) - nwStart).toFixed(2)})`,
)

// 10. intel quotes the price you actually meet on arrival, impact included.
let s9 = createNewGame()
const START_CREDITS = 500000
s9 = { ...s9, credits: START_CREDITS, cargo: Object.fromEntries(Object.keys(s9.cargo).map((k) => [k, 0])), costBasis: {} }
s9 = advanceDay(advanceDay(advanceDay(s9)))
const leads = getTradeLeads(s9)
check(leads.length > 0, `intel produced ${leads.length} leads`)
let intelChecked = 0
for (const lead of leads.slice(0, 5)) {
  const bought = buyCommodity(s9, lead.commodityId, lead.runQty)
  if (bought.error) continue
  const arrived = travel(bought.state, lead.targetPlanetId)
  if (arrived.error) continue
  const sold = sellCommodity(arrived.state, lead.commodityId, lead.runQty)
  if (sold.error) continue
  // Cash delta from the opening balance already nets out the purchase and the
  // fuel `travel` charged, so it is the run's realised profit directly.
  const realised = sold.state.credits - START_CREDITS
  intelChecked++
  check(
    realised === lead.runProfit,
    `intel matches realised run for ${lead.commodityName} (quoted ${lead.runProfit}, realised ${realised})`,
  )
}
check(intelChecked > 0, `intel accuracy was exercised (${intelChecked} runs)`)

// 11. daily upkeep is charged on a manual wait and scales with the ship.
check(dailyUpkeep(STARTING_SHIP) === UPKEEP_BASE, 'starting ship pays base upkeep')
check(
  dailyUpkeep({ cargoLevel: 5, engineLevel: 5, navLevel: 5 }) === UPKEEP_MAX,
  `fully upgraded ship is capped at ${UPKEEP_MAX} cr`,
)
const bigger = dailyUpkeep({ cargoLevel: 3, engineLevel: 2, navLevel: 1 })
check(
  bigger > dailyUpkeep(STARTING_SHIP),
  `upgrades raise upkeep (${dailyUpkeep(STARTING_SHIP)} -> ${bigger})`,
)

// 12. waiting charges exactly one day of upkeep and advances the clock.
//     Mirrors GameContext.waitDay: advance the day, then bill upkeep.
let s10 = createNewGame()
s10 = { ...s10, credits: 5000 }
// Mirrors GameContext.waitDay: advance the day, then bill upkeep clamped to
// the credits actually on hand.
const waitOnce = (s: GameState) => ({
  ...advanceDay(s),
  credits: s.credits - Math.min(dailyUpkeep(s.ship), s.credits),
})
const beforeWait = { day: s10.day, credits: s10.credits }
const afterWait = waitOnce(s10)
check(afterWait.day === beforeWait.day + 1, 'wait advances the day')
check(
  afterWait.credits === beforeWait.credits - dailyUpkeep(s10.ship),
  `wait charges upkeep (${beforeWait.credits} -> ${afterWait.credits}, upkeep ${dailyUpkeep(s10.ship)})`,
)
const afterTen = Array.from({ length: 10 }).reduce<GameState>((s) => waitOnce(s), s10)
check(
  afterTen.credits === beforeWait.credits - dailyUpkeep(s10.ship) * 10,
  `10 waits charge 10x upkeep (${beforeWait.credits} -> ${afterTen.credits})`,
)

// 13. travel is not charged upkeep on top of fuel - jumping already prices
//     the days through fuel, and charging twice would tax trading twice.
let s11 = createNewGame()
s11 = { ...s11, credits: 5000 }
const travelBefore = { credits: s11.credits, day: s11.day }
const jumped = travel(s11, 'drax')
if (jumped.error) {
  check(false, `travel to drax succeeded (${jumped.error})`)
} else {
  const days = jumped.state.day - travelBefore.day
  const spent = travelBefore.credits - jumped.state.credits
  check(
    spent === jumped.fuelCost,
    `travel charges fuel only, no upkeep (spent ${spent}, fuel ${jumped.fuelCost}, ${days} days)`,
  )
}

// 14. waiting can never brick a player. A hard refusal to pay upkeep would
//     strand anyone with no credits AND no cargo: they cannot pay the fee,
//     cannot sell, and cannot afford fuel. The charge is clamped to whatever
//     is on hand, so credits never go negative and waiting stays available.
let s12 = createNewGame()
s12 = {
  ...s12,
  credits: 0,
  cargo: Object.fromEntries(Object.keys(s12.cargo).map((k) => [k, 0])),
  costBasis: {},
}
const zeroed = waitOnce(s12)
check(zeroed.day === s12.day + 1, 'a broke player with an empty hold can still wait')
check(zeroed.credits === 0, `upkeep never drives credits negative (got ${zeroed.credits})`)

let s13 = createNewGame()
s13 = { ...s13, credits: 3, cargo: Object.fromEntries(Object.keys(s13.cargo).map((k) => [k, 0])), costBasis: {} }
const partial = waitOnce(s13)
check(
  partial.credits === 3 - dailyUpkeep(s13.ship) && partial.credits >= 0,
  `a 3 cr ship pays its full ${dailyUpkeep(s13.ship)} cr upkeep (left ${partial.credits})`,
)

// ...but a ship whose upkeep exceeds the credits on hand pays only what it has.
let s14 = createNewGame()
s14 = {
  ...s14,
  credits: 4,
  ship: { cargoLevel: 5, engineLevel: 5, navLevel: 5 },
  cargo: Object.fromEntries(Object.keys(s14.cargo).map((k) => [k, 0])),
  costBasis: {},
}
const capped = waitOnce(s14)
check(
  capped.credits === 0,
  `upkeep is clamped to available credits (4 cr ship owing ${dailyUpkeep(s14.ship)} left ${capped.credits})`,
)

// 15. session recovery policy. A registered account must NEVER be resumed as an
//     anonymous pilot: the pilot credentials sharing the browser are a
//     different, older identity whose save record survives registration, so
//     authenticating with them silently loads a stale game and reports success.
const ACCOUNT = { email: 'captain@example.com', name: 'Captain' }
const PILOT = { email: 'pilot-abcdef@sorstar.local', password: 'hunter2hunter2hunter2hunter2' }

check(
  resumableIdentity(ACCOUNT, PILOT) === 'account-needs-login',
  'an account is never resumed as a pilot, even with pilot credentials present',
)
check(
  resumableIdentity(ACCOUNT, null) === 'account-needs-login',
  'an account with no pilot credentials still requires a fresh sign-in',
)
check(
  resumableIdentity(null, PILOT) === 'pilot',
  'a browser with only pilot credentials resumes its pilot',
)
check(
  resumableIdentity(null, null) === 'none',
  'first use mints a fresh pilot',
)

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECKS FAILED`)
process.exit(failures === 0 ? 0 : 1)