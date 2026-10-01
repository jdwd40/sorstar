/**
 * Manual game-logic verification script.
 * Run with: npx tsx scripts/verify-game.ts
 */
import { carriedGoods, createNewGame, netWorth } from '../src/services/gameService'
import {
  advanceDay,
  buyCommodity,
  cargoBasisAt,
  quoteBuy,
  priceDirection,
  quoteSell,
  saleValue,
  sellCommodity,
} from '../src/services/marketService'
import { getTradeLeads } from '../src/services/intelService'
import { travel } from '../src/services/travelService'
import { resumableIdentity } from '../src/services/pocketBaseStore'
import { migrate } from '../src/services/migrate'
import { buyUpgrade, describeUpgrade } from '../src/services/playerService'
import type { Cargo, CommodityId, GameState } from '../src/types/game'
import {
  COMMODITY_MAP,
  GAME_VERSION,
  PLANETS,
  PLANET_MAP,
  STARTING_SHIP,
  UPKEEP_BASE,
  UPKEEP_MAX,
  cargoCapacityAtLevel,
  dailyUpkeep,
  fuelCostAtLevel,
} from '../src/data/gameData'

let failures = 0
/** Every commodity at zero, for handing a test a clean hold. */
const emptyCargo = (): Cargo => {
  const cargo = {} as Cargo
  for (const id of Object.keys(COMMODITY_MAP) as CommodityId[]) cargo[id] = 0
  return cargo
}

const check = (cond: boolean, label: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`)
  if (!cond) failures++
}

// 1. every planet has a priced market
const commoditiesToTest: CommodityId[] = ['food', 'metals', 'electronics', 'medicine', 'luxury', 'crystals']
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

// 7. a trade fills by walking the book, and the listing keeps the resting
//    price. Buyers used to pay the pre-drain price while sellers paid
//    post-restock, which handed buyers a free ride past their own market impact.
let s6 = createNewGame()
s6 = { ...s6, credits: 500000, cargo: emptyCargo(), costBasis: {} }
const listedPrice = s6.markets[s6.planetId].crystals.price
const stockBeforeBuy = s6.markets[s6.planetId].crystals.stock
const oneUnit = buyCommodity(s6, 'crystals', 1)
check(
  !oneUnit.error && s6.credits - oneUnit.state.credits === listedPrice,
  `a 1-unit buy fills at exactly the displayed price (${listedPrice} cr)`,
)
const buy6 = buyCommodity(s6, 'crystals', 10)
if (buy6.error) {
  check(false, `buy walks the book (unexpected error: ${buy6.error})`)
} else {
  const restingPrice = buy6.state.markets[s6.planetId].crystals.price
  check(restingPrice > listedPrice, 'price rises after draining stock')
  check(
    buy6.state.markets[s6.planetId].crystals.price === restingPrice,
    'listing keeps the resting price, not the average fill',
  )
  check(
    buy6.state.markets[s6.planetId].crystals.stock === stockBeforeBuy - 10,
    'buy removes exactly the traded quantity from stock',
  )
  // Impact accumulates across the order rather than landing only on its last
  // unit, so ten units cost strictly more than ten times the opening price.
  const spent = s6.credits - buy6.state.credits
  check(
    spent > listedPrice * 10,
    `a bulk buy pays more than the sticker price (spent ${spent} vs ${listedPrice * 10})`,
  )
}

// 7b. market impact cannot be dodged by splitting a trade into chunks. Pricing a
//     trade at the post-trade price charged the impact once instead of per unit,
//     so buying 100 food one unit at a time cost ~13% less than buying it in one
//     go. Averaging the fill fixed the magnitude but not the exploit: credits are
//     whole numbers, so rounding once per chunk made the total depend on how the
//     order was chopped up - ~6% cheaper the other way on cheap goods, where one
//     1 cr rounding step is a fifth of the price. Summing per-unit fills is
//     neutral by construction, so bulk and chunked must agree exactly.
/** A solvent player with a full hold, so tests exercise real order sizes. */
const rich = () => {
  const st = createNewGame()
  return {
    ...st,
    credits: 500000,
    ship: { ...st.ship, cargoLevel: 5 },
    cargo: emptyCargo(),
    costBasis: {},
  }
}

{
  for (const qty of [40, 70, 100]) {
    const bulk = buyCommodity(rich(), 'food', qty)
    // Guard against a vacuous pass: an order that errored would leave both
    // totals at zero and the comparison below would trivially hold.
    check(!bulk.error && bulk.state.cargo.food === qty, `bulk buy of ${qty} food loads ${qty} units`)
    if (bulk.error) continue
    let chunked = rich()
    let chunkErrors = 0
    for (let i = 0; i < qty; i++) {
      const step = buyCommodity(chunked, 'food', 1)
      if (step.error) chunkErrors++
      chunked = step.state
    }
    check(
      chunkErrors === 0 && chunked.cargo.food === qty,
      `chunked buy of ${qty} loads the same total with no errors`,
    )
    const bulkCost = rich().credits - bulk.state.credits
    const chunkCost = rich().credits - chunked.credits
    check(
      bulkCost === chunkCost,
      `buying ${qty} food in chunks costs exactly the same as in bulk (${bulkCost} vs ${chunkCost})`,
    )
  }

  // The realistic sell case: buy a load first, so stock sits below its ceiling
  // and restocking actually moves the price.
  const load = buyCommodity(rich(), 'food', 100)
  check(!load.error, 'sell setup: a full load succeeds')
  if (!load.error) {
    const m = load.state.markets[load.state.planetId].food
    check(m.stock < m.stockMax, 'sell setup: stock sits below its ceiling after loading')
    for (const qty of [50, 100]) {
      const bulk = sellCommodity(load.state, 'food', qty)
      check(!bulk.error, `bulk sell of ${qty} food succeeds`)
      if (bulk.error) continue
      let chunked = load.state
      for (let i = 0; i < qty; i++) chunked = sellCommodity(chunked, 'food', 1).state
      const bulkProceeds = bulk.state.credits - load.state.credits
      const chunkProceeds = chunked.credits - load.state.credits
      check(
        chunked.cargo.food === load.state.cargo.food - qty,
        `chunked sell of ${qty} sells the same total`,
      )
      check(
        bulkProceeds === chunkProceeds,
        `selling ${qty} food in chunks pays exactly the same as in bulk (${bulkProceeds} vs ${chunkProceeds})`,
      )
    }
  }
}

// 8. buying can no longer inflate net worth. Cargo is marked to cost basis,
//    so trading moves credits but not equity until the goods actually sell.
let s7 = createNewGame()
s7 = { ...s7, credits: 500000, cargo: emptyCargo(), costBasis: {} }
const nwBefore = netWorth(s7)
const buy7 = buyCommodity(s7, 'crystals', 10)
if (buy7.error) {
  check(false, `buying does not inflate net worth (unexpected error: ${buy7.error})`)
} else {
  check(
    Math.abs(netWorth(buy7.state) - nwBefore) < 1e-9,
    'buying does not inflate net worth',
  )
  // A same-planet round trip is exactly neutral: the buy pays the going price
  // as stock drains and selling straight back pays it as stock is restored, so
  // the two walks retrace each other. Fair either way - no free money, no
  // phantom penalty - so the invariant is "never profitable".
  const sell7 = sellCommodity(buy7.state, 'crystals', 10)
  check(
    !sell7.error && netWorth(sell7.state) <= nwBefore + 1e-9,
    'a same-planet round trip can never print money',
  )
}

// 8b. a same-day buy/sell round trip must be worth exactly nothing, forever.
//     Charging a sale at the book *before* each unit joins stock, while a buy
//     charges the book before each unit leaves, shifts the sale to {S-q..S-1}
//     so it no longer retraces the buy's {S-q+1..S}. The pair then nets
//     P(S-q) - P(S) per cycle with stock fully restored - free credits, on
//     repeat, on the same day. Cheap to miss (it is a few credits a cycle) and
//     fatal if it ships, so it is brute-forced here rather than spot-checked.
{
  let worst = 0
  let worstCase = ''
  for (const cid of Object.keys(COMMODITY_MAP) as CommodityId[]) {
    for (const qty of [1, 5, 10, 50, 100]) {
      const st = rich()
      const nw0 = netWorth(st)
      let cur = st
      for (let i = 0; i < 30; i++) {
        const bought = buyCommodity(cur, cid, qty)
        if (bought.error) {
          cur = bought.state
          continue
        }
        const sold = sellCommodity(bought.state, cid, qty)
        cur = sold.error ? bought.state : sold.state
      }
      const gain = netWorth(cur) - nw0
      if (gain > worst) {
        worst = gain
        worstCase = `${cid} x${qty}`
      }
    }
  }
  check(worst <= 0, `30 same-day round trips never print money (worst ${worst.toFixed(4)} cr${worstCase ? ` from ${worstCase}` : ''})`)
}

// 8c. every surface that quotes a sale quotes the settlement, not the sticker.
//     The Trade tab reads the quote, but so do the Ship tab's hold table and
//     the arrival report, and all three used to reach for `qty * listing.price`.
//     A resting price is the price of the *next* unit, so valuing a load by it
//     ignores the impact of the load itself and overstated a full hold by more
//     than 10% - "your cargo is worth 900 cr" followed by a sale that paid 786.
//     One helper (`saleValue`) now backs all of them, and it has to agree with
//     the credits that actually move.
{
  const held = buyCommodity(rich(), 'food', 100).state
  const listed = held.markets[held.planetId].food.price * 100
  const quote = saleValue(held, 'food', 100)
  const sold = sellCommodity(held, 'food', 100)
  check(!sold.error, 'sell setup: a full hold sells')
  if (!sold.error) {
    check(
      quote === sold.state.credits - held.credits,
      `a quoted sale pays exactly what the sale credits (${quote} vs ${sold.state.credits - held.credits})`,
    )
    check(
      quote < listed,
      `the settled figure accounts for market impact the sticker price does not (${quote} < ${listed})`,
    )
    const good = carriedGoods(held).find((g) => g.commodity.id === 'food')
    check(
      !!good && good.sellsFor === quote,
      'the hold table values a line at its settled sale value',
    )
  }
  // And a quote the player cannot actually take must not promise money.
  check(saleValue(held, 'food', 0) === 0, 'a zero-unit sale is worth nothing')
  check(
    saleValue(held, 'food', 101) > saleValue(held, 'food', 100),
    'a larger sale is worth more, at a worse average',
  )
}

// 8d. One cost-basis fallback, read the same way everywhere. `migrate` drops a
//     cost-basis entry it cannot read, so the fallback is reachable from a
//     repaired save - and it used to have three answers to the same missing
//     datum: net worth used the commodity's base price while the hold table and
//     the sale itself used the local market price. Net worth could therefore
//     disagree with the very sale it was measuring.
{
  const basisless = {
    ...createNewGame(),
    cargo: { ...emptyCargo(), food: 10 },
    costBasis: {},
  } as GameState
  const basis = basisless.markets[basisless.planetId].food.price
  check(
    cargoBasisAt(basisless, 'food') === basis,
    `a missing cost basis falls back to the local market price (got ${cargoBasisAt(basisless, 'food')}, market ${basis})`,
  )
  // The three read sites must agree, which is the whole point of the helper.
  const line = carriedGoods(basisless).find((g) => g.commodity.id === 'food')
  check(
    !!line && line.costBasis === basis,
    `the hold table reads the same fallback net worth does (got ${line?.costBasis})`,
  )
  check(
    netWorth(basisless) === basisless.credits + 10 * basis,
    `net worth marks the missing-basis load at the same number (got ${netWorth(basisless)})`,
  )
  // And that number is what the sale is then measured against, so a load with
  // no recorded basis cannot book a profit just by being sold.
  const dumped = sellCommodity(basisless, 'food', 10)
  check(
    !dumped.error && Math.abs(dumped.state.stats.tradingProfit - (dumped.state.credits - basisless.credits - 10 * basis)) < 1e-6,
    `the sale measures against the same basis (${!dumped.error ? dumped.state.stats.tradingProfit : 'n/a'})`,
  )
}

// 9. waiting a day and re-buying cannot farm net worth. This was worth ~4k cr
//    over 40 iterations when cargo was marked to the live local price.
let s8 = createNewGame()
s8 = { ...s8, cargo: emptyCargo(), costBasis: {} }
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

// 10. intel forecasts the arrival price instead of knowing it.
//
//     This used to assert `realised === lead.runProfit`, which was only ever
//     true because `randomFactor` is a pure function of (planet, commodity,
//     day): the live quote re-derived the exact arrival price, so a lead could
//     promise a number instead of an expectation, and the Navigation Array was
//     a solver. What matters now is that the forecast brackets reality, is
//     unbiased, and is genuinely uncertain.
let s9 = createNewGame()
const START_CREDITS = 500000
s9 = { ...s9, credits: START_CREDITS, cargo: emptyCargo(), costBasis: {} }
s9 = advanceDay(advanceDay(advanceDay(s9)))
const leads = getTradeLeads(s9)
check(leads.length > 0, `intel produced ${leads.length} leads`)

/** Runs one lead end to end and reports what it actually banked. */
function runLead(state: GameState, lead: ReturnType<typeof getTradeLeads>[number]): number | null {
  const bought = buyCommodity(state, lead.commodityId, lead.runQty)
  if (bought.error) return null
  const arrived = travel(bought.state, lead.targetPlanetId)
  if (arrived.error) return null
  const sold = sellCommodity(arrived.state, lead.commodityId, lead.runQty)
  if (sold.error) return null
  // The cash delta from the opening balance already nets out the purchase and
  // the fuel `travel` charged, so it is the run's realised profit directly.
  return sold.state.credits - START_CREDITS
}

let intelChecked = 0
let insideBand = 0
let mismatched = 0
let quoted = 0
let realised = 0
// Walk forward through many days so the sample spans a range of arrivals rather
// than a single day's drift.
let walk = s9
for (let d = 0; d < 150 && intelChecked < 250; d++) {
  for (const lead of getTradeLeads(walk).slice(0, 4)) {
    const got = runLead(walk, lead)
    if (got === null) continue
    intelChecked++
    quoted += lead.runProfit
    realised += got
    // No slack: the edges are built from whole-credit totals, so an outcome
    // sitting exactly on an edge is a real outcome, not a rounding artefact.
    if (got >= lead.worstCase && got <= lead.bestCase) insideBand++
    if (Math.abs(got - lead.runProfit) > 1) mismatched++
  }
  walk = advanceDay(walk)
}
check(intelChecked >= 150, `intel forecasts were exercised (${intelChecked} runs)`)
check(
  insideBand === intelChecked,
  `every realised run lands inside its quoted range (${insideBand}/${intelChecked})`,
)
check(
  mismatched > 0 && mismatched < intelChecked,
  `the forecast is a real forecast - not always wrong, not always exact (${mismatched}/${intelChecked} differed)`,
)
// The property that actually matters for fairness is that intel is not
// systematically *optimistic* - a forecast that flattered itself would send
// players chasing leads that lose money. Centring the drift on 1.0 makes the
// forecast the true expectation, and in practice it runs a couple of percent
// conservative (over 900 sampled runs: 131.1 quoted vs 127.5 realised), which
// is the safe direction to be wrong in. Note the sample is correlated - leads
// sharing a destination share its arrival-day drift - so treat the mean as a
// sanity check, not a precise estimate.
const meanQuoted = quoted / intelChecked
const meanRealised = realised / intelChecked
check(
  meanRealised <= meanQuoted * 1.05 + 5,
  `the forecast is not systematically optimistic (quoted mean ${meanQuoted.toFixed(1)}, realised mean ${meanRealised.toFixed(1)})`,
)
check(
  Math.abs(meanRealised - meanQuoted) < Math.max(15, Math.abs(meanQuoted) * 0.25),
  `the forecast tracks reality (quoted mean ${meanQuoted.toFixed(1)}, realised mean ${meanRealised.toFixed(1)})`,
)
// A lead whose worst case is negative is still shown: the player is told the
// downside rather than having it hidden behind an expected number.
const risky = leads.find((l) => l.worstCase < 0)
check(
  leads.every((l) => l.sellPriceLow < l.sellPriceHigh && l.worstCase <= l.runProfit && l.runProfit <= l.bestCase),
  'leads bracket their own expectation',
)
// The band edges come from whole-credit totals, so they land on integers.
// Rebuilding them by multiplying the average unit price back out by the
// quantity reintroduces float error and widens the band a hair past the
// outcomes it is supposed to contain.
check(
  leads.every((l) => Number.isInteger(l.runProfit) && Number.isInteger(l.worstCase) && Number.isInteger(l.bestCase)),
  'lead profits and band edges are whole credits',
)
if (risky) {
  check(true, `a lead can have a negative worst case (${risky.worstCase} cr) and is still surfaced`)
}

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
  cargo: emptyCargo(),
  costBasis: {},
}
const zeroed = waitOnce(s12)
check(zeroed.day === s12.day + 1, 'a broke player with an empty hold can still wait')
check(zeroed.credits === 0, `upkeep never drives credits negative (got ${zeroed.credits})`)

let s13 = createNewGame()
s13 = { ...s13, credits: 3, cargo: emptyCargo(), costBasis: {} }
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
  ship: { ...STARTING_SHIP, cargoLevel: 5 },
  cargo: emptyCargo(),
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

// Malformed-save repair. The realistic way to reach one of these is a save
// edited by hand or written by a future bug, not an old build, so `migrate`
// sanitises on every load rather than only on version upgrades.
const asSave = (over: Record<string, unknown>) => ({ ...createNewGame(), ...over }) as unknown as GameState
const throwsWith = (over: Record<string, unknown>, fragment: string) => {
  try {
    migrate(asSave(over))
    return false
  } catch (e) {
    return e instanceof Error && e.message.includes(fragment)
  }
}

/** Exact-message variant: a substring match can hide a doubled field path. */
const throwsWithExactly = (over: Record<string, unknown>, message: string) => {
  try {
    migrate(asSave(over))
    return false
  } catch (e) {
    return e instanceof Error && e.message === message
  }
}

const withoutBasis = { ...createNewGame() } as Partial<GameState>
delete withoutBasis.costBasis
const basisBackfilled = migrate(withoutBasis as GameState)
check(
  basisBackfilled.costBasis !== undefined &&
    typeof basisBackfilled.costBasis === 'object' &&
    Number.isFinite(netWorth(basisBackfilled)),
  'a save with no costBasis loads, with net worth still computable',
)

const repaired = migrate(asSave({ costBasis: { food: 12, fuel: NaN, medicine: -5 } }))
check(
  repaired.costBasis.food === 12 && repaired.costBasis.fuel === undefined && repaired.costBasis.medicine === undefined,
  'a damaged costBasis keeps its good entries and drops the unusable ones',
)

const cargoFixed = migrate(asSave({ cargo: { food: 7, fuel: NaN, medicine: Infinity, ...{} } }))
check(
  cargoFixed.cargo.food === 7 &&
    cargoFixed.cargo.fuel === 0 &&
    cargoFixed.cargo.medicine === 0 &&
    Object.keys(cargoFixed.cargo).length === Object.keys(COMMODITY_MAP).length,
  'a damaged cargo is repaired, zero-filled, and carries no stray keys',
)

const statsFixed = migrate(asSave({ stats: {} as never }))
check(
  ['tradingProfit', 'goodsBought', 'goodsSold', 'tripsMade', 'upgradesInvested', 'maxNetWorth'].every(
    (k) => statsFixed.stats[k as keyof GameState['stats']] === 0,
  ),
  'missing stats default to zero rather than poisoning every later total',
)
check(
  throwsWith({ stats: { ...createNewGame().stats, tradingProfit: NaN } }, 'stats.tradingProfit'),
  'a NaN cumulative total is reported instead of silently defeating the victory gate',
)
check(
  throwsWith({ costBasis: 'oops' }, 'costBasis must be an object'),
  'a structurally impossible costBasis is reported',
)

// The market panel draws its day-over-day arrow from `prevPrice`. A listing
// that lost it renders "NaN%" beside a perfectly good price, which is the one
// thing on that row a player cannot do anything about.
{
  const noPrev = createNewGame()
  const { price, stock, stockMax, baseStock } = noPrev.markets[noPrev.planetId].food
  const record = noPrev.markets[noPrev.planetId]
  const state = {
    ...noPrev,
    markets: {
      ...noPrev.markets,
      [noPrev.planetId]: { ...record, food: { price, stock, stockMax, baseStock } },
    },
  } as unknown as GameState
  const fixedPrev = migrate(state)
  const repairedFood = fixedPrev.markets[fixedPrev.planetId].food
  check(
    repairedFood.prevPrice === repairedFood.price && Number.isFinite(repairedFood.prevPrice),
    'a listing missing prevPrice is repaired rather than rendering NaN%',
  )
  check(
    priceDirection(repairedFood) === 'flat',
    'a repaired listing reads as unchanged rather than as a NaN move',
  )
}

// 16. Upgrade messaging. A cargo tier that grew the hold from 12 to 20 units
//     announced "(+20 units)": the player was told 20 units were added when 8
//     were. The total and the increment are different claims and both are
//     stated now, and every tier is checked so a future tier cannot regress.
{
  let up = { ...createNewGame(), credits: 1_000_000 }
  for (const type of ['cargo', 'engine', 'nav'] as const) {
    const before = up.ship
    const res = buyUpgrade(up, type)
    if (res.error || !res.applied) {
      check(false, `upgrade ${type} applied (unexpected error: ${res.error})`)
      continue
    }
    const line = describeUpgrade(res)
    if (type === 'cargo') {
      const from = cargoCapacityAtLevel(before.cargoLevel)
      const to = cargoCapacityAtLevel(res.state.ship.cargoLevel)
      check(
        res.upgradeDetail === `${to} units (+${to - from})`,
        `cargo Lv${res.state.ship.cargoLevel} reports "${to} units (+${to - from})" (got ${JSON.stringify(res.upgradeDetail)})`,
      )
      check(
        line === `Installed Cargo Hold Lv${res.state.ship.cargoLevel} — ${to} units (+${to - from}).`,
        `the cargo log line states the increment, not the total: ${line}`,
      )
    }
    if (type === 'engine') {
      check(
        res.upgradeDetail ===
          `${fuelCostAtLevel(res.state.ship.engineLevel)} cr/ly (was ${fuelCostAtLevel(before.engineLevel)})`,
        `engine reports the tier it came down from (got ${JSON.stringify(res.upgradeDetail)})`,
      )
    }
    if (type === 'nav') {
      check(
        res.upgradeName === `Navigation Array Lv${res.state.ship.navLevel}`,
        `nav reports its level like the other tiers (got ${JSON.stringify(res.upgradeName)})`,
      )
    }
    // The upgrade spend has to be recorded exactly once.
    check(
      res.state.stats.upgradesInvested > up.stats.upgradesInvested &&
        res.state.stats.upgradesInvested === up.stats.upgradesInvested + (res.state.credits !== up.credits ? up.credits - res.state.credits : 0),
      `upgrade spend is recorded once (${up.stats.upgradesInvested} -> ${res.state.stats.upgradesInvested})`,
    )
    up = res.state
  }
}

// 17. `tradingProfit` is trading profit and nothing else. It used to be called
//     `totalProfit` and shown as "Lifetime profit", which read as money made -
//     while silently excluding fuel, upkeep and upgrade spend. The accounting
//     was always right; the name and the labels were the lie.
{
  // A default hold, so there is a cargo tier left to buy and the upgrade can
  // actually be afforded.
  let econ = buyCommodity({ ...createNewGame(), credits: 500_000 }, 'food', 10).state
  check(econ.stats.tradingProfit === 0, 'buying books no profit')
  econ = travel(econ, 'drax').state
  check(econ.stats.tradingProfit === 0, 'travelling books no profit')
  const withUpgrade = buyUpgrade(econ, 'cargo')
  check(
    withUpgrade.applied === true && withUpgrade.state.stats.tradingProfit === 0,
    `spending credits on an upgrade books no profit (${withUpgrade.error ?? 'applied'})`,
  )
  econ = advanceDay(withUpgrade.state)
  check(econ.stats.tradingProfit === 0, 'waiting a day books no profit')
  const soldEcon = sellCommodity(econ, 'food', 10)
  check(!soldEcon.error, 'the run can be sold')
  if (!soldEcon.error) {
    const booked = soldEcon.state.stats.tradingProfit
    const cash = soldEcon.state.credits - econ.credits
    check(booked !== 0, 'a sale books trading profit')
    // Proceeds minus the cost basis of what was sold, and nothing else: the
    // fuel and upkeep already paid came out of `credits`, not out of this.
    const basis = econ.costBasis.food ?? 0
    check(
      Math.abs(booked - (cash - basis * 10)) < 1e-6,
      `trading profit is proceeds less cost basis, with no other costs folded in (${booked} vs ${cash - basis * 10})`,
    )
  }
  // A loss is a loss: the stat is not floored at zero, or a player who dumps a
  // bad load would read "no loss" from the summary.
  const dumped = sellCommodity(
    { ...createNewGame(), credits: 0, cargo: { ...emptyCargo(), crystals: 5 }, costBasis: { crystals: 5_000 } },
    'crystals',
    5,
  )
  check(!dumped.error && dumped.state.stats.tradingProfit < 0, 'a loss is recorded as a negative, not clamped')
}

// 18. A v2 save carries `totalProfit` forward as `tradingProfit`. The number is
//     unchanged; only its name - and what the UI may honestly call it - is not.
{
  const legacy = asSave({
    version: 2,
    stats: { ...createNewGame().stats, tradingProfit: undefined, totalProfit: 4321 },
  })
  const carried = migrate(legacy)
  check(
    carried.stats.tradingProfit === 4321 && !('totalProfit' in carried.stats),
    'a v2 save migrates totalProfit to tradingProfit and drops the old key',
  )
  check(carried.version === GAME_VERSION, `the migrated save is stamped v${GAME_VERSION} (got v${carried.version})`)
  check(
    throwsWith({ version: 2, stats: { ...createNewGame().stats, totalProfit: NaN } }, 'stats.totalProfit'),
    'an unreadable legacy total is reported, not quietly zeroed',
  )
  // Substring matching hid a doubled prefix here: "stats.stats.totalProfit"
  // contains "stats.totalProfit", so the check above passed against the very
  // typo it was meant to catch. Anchor on the whole field path.
  check(
    throwsWithExactly(
      { version: 2, stats: { ...createNewGame().stats, totalProfit: NaN } },
      'Corrupt save: stats.totalProfit (legacy tradingProfit) must be a number',
    ),
    'the legacy field is named once, not stats.stats.totalProfit',
  )
}

// Quantity guards. NaN fails every `qty <= 0` and `cost > credits` comparison,
// so before the fix it sailed straight through and wrote NaN into cargo and
// cost basis - corruption that would then be saved.
const loaded: GameState = {
  ...createNewGame(),
  credits: 500000,
  ship: { ...createNewGame().ship, cargoLevel: 5 },
}
const badQtys = [NaN, Infinity, -Infinity, 1.5, 0, -1]
check(
  badQtys.every((q) => buyCommodity(loaded, 'food', q).error !== undefined) &&
    badQtys.every((q) => sellCommodity(loaded, 'food', q).error !== undefined),
  'trades reject malformed quantities outright',
)
check(
  badQtys.every((q) => {
    const r = buyCommodity(loaded, 'food', q)
    return r.state === loaded
  }),
  'a rejected quantity leaves the state untouched',
)
const qtySafe = badQtys.reduce((st, q) => buyCommodity(st, 'food', q).state, loaded)
check(
  Object.values(qtySafe.cargo).every(Number.isFinite) &&
    Object.values(qtySafe.costBasis).every((v) => v === undefined || Number.isFinite(v)),
  'no malformed quantity can write a non-finite cargo or cost basis',
)
// A non-finite quantity is not merely wrong, it hangs: the fill loop compares
// `k < units`, and `Infinity` never fails that, so the tab spins. This asserts
// every malformed quantity quotes as exactly zero units. The fill loops clamp
// as well as the quoting functions, so if either guard goes this fails fast
// instead of hanging.
const home = loaded.planetId
const market = loaded.markets[home].food
const buyFor = (n: number) => quoteBuy(PLANET_MAP[home]!, COMMODITY_MAP.food, market, n, loaded.day)
const sellFor = (n: number) => quoteSell(PLANET_MAP[home]!, COMMODITY_MAP.food, market, n, loaded.day)
check(
  [NaN, Infinity, -Infinity, -3.7].every((n) => buyFor(n).cost === buyFor(0).cost && sellFor(n).proceeds === 0),
  'a quote for a non-finite quantity is zero units, not an unbounded loop',
)
check(
  buyFor(2.9).cost === buyFor(2).cost && sellFor(2.9).proceeds === sellFor(2).proceeds,
  'a fractional quantity fills whole units',
)

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECKS FAILED`)
process.exit(failures === 0 ? 0 : 1)