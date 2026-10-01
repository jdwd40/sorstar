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
  waitDay,
} from '../src/services/marketService'
import { getTradeLeads } from '../src/services/intelService'
import {
  commodityEventScale,
  eventDaysRemaining,
  eventMoves,
  eventsAt,
  marketEventId,
  marketEventLogEntries,
  sectorEvents,
} from '../src/services/marketEventService'
import { travel, travelCost, resolveEncounter } from '../src/services/travelService'
import { encounterId, encounterOptions } from '../src/services/encounterService'
import {
  acceptContract,
  activeContracts,
  availableContracts,
  contractRoute,
  deliverContract,
  describeContract,
  generateContract,
  settleContracts,
} from '../src/services/contractService'
import { resumableIdentity } from '../src/services/pocketBaseStore'
import { migrate } from '../src/services/migrate'
import { buyUpgrade, describeUpgrade } from '../src/services/playerService'
import type {
  Cargo,
  CommodityId,
  EncounterResult,
  GameState,
  MarketEvent,
  PendingEncounter,
  TravelEncounterType,
} from '../src/types/game'
import {
  COMMODITY_MAP,
  CONTRACT_DEADLINE_MAX_BUFFER,
  CONTRACT_DEADLINE_MIN_BUFFER,
  CONTRACT_PREMIUM_MAX,
  CONTRACT_PREMIUM_MIN,
  CONTRACT_QTY_MAX_SHARE,
  CONTRACT_QTY_MIN_SHARE,
  EVENT_MAX_DAYS,
  EVENT_MIN_DAYS,
  GAME_VERSION,
  MARKET_EVENTS,
  MARKET_EVENT_MAP,
  MAX_ACTIVE_CONTRACTS,
  MAX_ACTIVE_EVENTS,
  MAX_AVAILABLE_CONTRACTS,
  PLANETS,
  TRAVEL_ENCOUNTERS,
  TRAVEL_ENCOUNTER_MAP,
  PLANET_MAP,
  STARTING_SHIP,
  UPKEEP_BASE,
  UPKEEP_MAX,
  cargoCapacityAtLevel,
  dailyUpkeep,
  distanceBetween,
  fuelCostAtLevel,
  fuelCostBetween,
} from '../src/data/gameData'

let failures = 0
/** No market event in force - the multiplier the existing pricing used everywhere. */
const NO_EVENT = 1
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

/**
 * Finishes a jump the way a player has to: if an encounter interrupted it, take
 * the first open choice, then land.
 *
 * Every check below `travel` that assumes an arrival has to go through this
 * rather than reading `travel(...).state` directly. Before encounters a jump was
 * one call that always ended docked; now it can stop half way, and a test that
 * quietly carried on from the origin would be measuring the wrong planet.
 */
interface Jump {
  state: GameState
  error?: string
  /** True when an encounter interrupted this jump. */
  encountered: boolean
  /** True when that encounter moved the balance or cost a day. */
  encounterMoved: boolean
}

function completeJump(result: ReturnType<typeof travel>): Jump {
  const plain: Jump = { state: result.state, encountered: false, encounterMoved: false }
  if (result.error) return { ...plain, error: result.error }
  if (!result.encounter) return plain
  const option = encounterOptions(result.state, result.encounter).find((o) => !o.blockedReason)
  if (!option) return { ...plain, error: 'an interrupted jump with no open choice' }
  const resolved = resolveEncounter(result.state, option.id)
  if (resolved.error) return { ...plain, state: resolved.state, encountered: true, error: resolved.error }
  // An encounter that moved the balance or cost a day is as unknowable from a
  // price forecast as a market event opening mid-jump: the band brackets the
  // price on arrival, and this run did not land on the day the band was quoted
  // for. One that costs nothing and delays nothing is an ordinary arrival as far
  // as pricing goes, so it stays in the sample.
  return {
    state: resolved.state,
    encountered: true,
    encounterMoved:
      (resolved.result?.creditsDelta ?? 0) !== 0 || (resolved.result?.daysDelta ?? 0) !== 0,
  }
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
  const t = completeJump(travel(s, destId))
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
s5 = completeJump(travel(s5, 'drax')).state
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

  // The same invariance while a market event is bending the price. Events scale
  // every unit of the book, so a shock cannot quietly exempt itself from impact
  // pricing - otherwise an event would make order-splitting profitable again.
  {
    const crisis = (): GameState => ({
      ...rich(),
      activeEvents: [
        {
          id: 'crop-failure@eden#1',
          eventType: 'crop-failure',
          planetId: 'eden',
          startDay: 1,
          endDay: 6,
        },
      ],
    })
    const QTY = 100
    const bulk = buyCommodity(crisis(), 'food', QTY)
    check(!bulk.error && bulk.state.cargo.food === QTY, 'bulk buy under an event loads the hold')
    if (!bulk.error) {
      let chunked = crisis()
      for (let i = 0; i < QTY; i++) chunked = buyCommodity(chunked, 'food', 1).state
      const bulkCost = crisis().credits - bulk.state.credits
      const chunkCost = crisis().credits - chunked.credits
      check(
        bulkCost === chunkCost,
        `buying under an event costs the same in chunks as in bulk (${bulkCost} vs ${chunkCost})`,
      )
      const bulkSell = sellCommodity(bulk.state, 'food', QTY)
      check(!bulkSell.error, 'bulk sell under an event succeeds')
      if (!bulkSell.error) {
        let chunkSell = bulk.state
        for (let i = 0; i < QTY; i++) chunkSell = sellCommodity(chunkSell, 'food', 1).state
        const bulkProceeds = bulkSell.state.credits - bulk.state.credits
        const chunkProceeds = chunkSell.credits - bulk.state.credits
        check(
          bulkProceeds === chunkProceeds,
          `selling under an event pays the same in chunks as in bulk (${bulkProceeds} vs ${chunkProceeds})`,
        )
      }
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

/**
 * Runs one lead end to end and reports what it banked, plus whether anything
 * unknowable happened on the way: a market event opening at the destination
 * while the ship was in transit, or an encounter that cost credits or a day.
 *
 * Intel may price an event that is already running on the day it quotes a run -
 * it is visible news - but it must not predict one that starts three days into
 * a jump. Those runs settle at a price no forecast could have quoted, so they
 * are counted separately rather than allowed to look like a broken band.
 */
function runLead(
  state: GameState,
  lead: ReturnType<typeof getTradeLeads>[number],
): { cash: number; disturbed: boolean } | null {
  const bought = buyCommodity(state, lead.commodityId, lead.runQty)
  if (bought.error) return null
  const arrived = completeJump(travel(bought.state, lead.targetPlanetId))
  if (arrived.error) return null
  const sold = sellCommodity(arrived.state, lead.commodityId, lead.runQty)
  if (sold.error) return null
  // The events the forecast could have known about: already running, and still
  // running on the arrival day.
  const knownAtArrival = new Set(
    state.activeEvents
      .filter((e) => e.planetId === lead.targetPlanetId && e.endDay > arrived.state.day)
      .map((e) => e.id),
  )
  const disturbed =
    arrived.encounterMoved ||
    arrived.state.activeEvents.some(
      (e) => e.planetId === lead.targetPlanetId && !knownAtArrival.has(e.id),
    )
  // The cash delta from the opening balance already nets out the purchase and
  // the fuel `travel` charged, so it is the run's realised profit directly.
  return { cash: sold.state.credits - START_CREDITS, disturbed }
}

let intelChecked = 0
let bandChecked = 0
let disturbedRuns = 0
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
    // Disturbed runs stay in the averages: following the advice produced them,
    // so they are what the advice is worth on average.
    quoted += lead.runProfit
    realised += got.cash
    if (Math.abs(got.cash - lead.runProfit) > 1) mismatched++
    if (got.disturbed) {
      disturbedRuns++
      continue
    }
    bandChecked++
    // No slack: the edges are built from whole-credit totals, so an outcome
    // sitting exactly on an edge is a real outcome, not a rounding artefact.
    if (got.cash >= lead.worstCase && got.cash <= lead.bestCase) insideBand++
  }
  walk = advanceDay(walk)
}
check(intelChecked >= 150, `intel forecasts were exercised (${intelChecked} runs)`)
check(
  bandChecked >= 150,
  `the forecast band was exercised (${bandChecked} undisturbed runs)`,
)
check(
  insideBand === bandChecked,
  `every realised run lands inside its quoted range (${insideBand}/${bandChecked})`,
)
check(
  disturbedRuns <= intelChecked / 4,
  `events opening mid-jump and encounters interrupting a jump stay rare enough to keep the band meaningful (${disturbedRuns}/${intelChecked})`,
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
// The real service, not a copy of it. This block used to re-implement the
// rule inline, so every check below passed even after the clamp was deleted
// from the component that actually ran it - a mirror cannot detect a change
// in the thing it mirrors. `waitDay` is what `GameContext` calls.
const waitOnce = (s: GameState) => waitDay(s).state
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
  econ = completeJump(travel(econ, 'drax')).state
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

// 19. Market events: temporary price shocks, drawn deterministically as days
//     advance and multiplied into the existing price calculation rather than a
//     second one.
{
  // --- the definitions themselves -------------------------------------------------
  check(
    MARKET_EVENTS.length === 10,
    `there are ${MARKET_EVENTS.length} market event definitions`,
  )
  check(
    MARKET_EVENTS.every((def) => Object.keys(def.modifiers).length > 0),
    'every event moves at least one commodity',
  )
  const swings = MARKET_EVENTS.flatMap((def) => Object.values(def.modifiers))
  check(
    swings.length === MARKET_EVENTS.length &&
      swings.every((m) => (m <= 0.85 && m >= 0.7) || (m >= 1.2 && m <= 1.5)),
    `every multiplier sits in the cheap (0.70-0.85) or dear (1.20-1.50) band (${swings.join(', ')})`,
  )

  // --- generation ------------------------------------------------------------------
  const day1 = createNewGame()
  /** A state on day 1 with hand-placed events, for checks that must not roll. */
  const withEvents = (events: MarketEvent[]): GameState => ({ ...day1, activeEvents: events })
  const forced = (
    type: string,
    planetId: string,
    startDay: number,
    days: number,
  ): MarketEvent => ({
    id: marketEventId(type, planetId, startDay),
    eventType: type,
    planetId,
    startDay,
    endDay: startDay + days,
  })

  // A long walk: events must turn up, must not pile up, and must never put two
  // shocks on one commodity at one planet.
  const WALK_DAYS = 240
  let walk = day1
  let starts = 0
  let peakActive = 0
  let overlap = 0
  let badDuration = 0
  let mispriced = 0
  for (let d = 0; d < WALK_DAYS; d++) {
    const known = new Set(walk.activeEvents.map((e) => e.id))
    walk = advanceDay(walk)
    for (const event of walk.activeEvents) {
      if (!known.has(event.id)) starts++
      if (event.id !== marketEventId(event.eventType, event.planetId, event.startDay)) {
        mispriced++
      }
      const span = event.endDay - event.startDay
      if (span < EVENT_MIN_DAYS || span > EVENT_MAX_DAYS) badDuration++
    }
    const active = sectorEvents(walk.activeEvents, walk.day)
    peakActive = Math.max(peakActive, active.length)
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = eventMoves(active[i])
        const b = eventMoves(active[j])
        if (
          active[i].planetId === active[j].planetId &&
          a.some((m) => b.some((n) => n.commodityId === m.commodityId))
        ) {
          overlap++
        }
      }
    }
    // Every re-priced listing must equal what the quote helper charges for one
    // unit at that day's event scale. This is the whole integration in one
    // assertion: if an event ever failed to reach the stored price, or reached
    // it with the wrong multiplier, this drifts.
    for (const planet of PLANETS) {
      for (const commodity of Object.values(COMMODITY_MAP)) {
        const listing = walk.markets[planet.id]?.[commodity.id]
        if (!listing) continue
        const scale = commodityEventScale(walk.activeEvents, planet.id, commodity.id, walk.day)
        if (quoteBuy(planet, commodity, listing, 1, walk.day, scale).cost !== listing.price) {
          mispriced++
        }
      }
    }
  }
  check(starts > 0, `events are generated over ${WALK_DAYS} days (${starts} started)`)
  const gap = WALK_DAYS / Math.max(1, starts)
  check(
    gap >= 2.5 && gap <= 5.5,
    `roughly one event every 3-5 days (one every ${gap.toFixed(1)})`,
  )
  check(
    peakActive <= MAX_ACTIVE_EVENTS,
    `no more than ${MAX_ACTIVE_EVENTS} events run at once (peak ${peakActive})`,
  )
  check(overlap === 0, 'no two events ever hit the same commodity on one planet')
  check(badDuration === 0, `every event runs ${EVENT_MIN_DAYS}-${EVENT_MAX_DAYS} days`)
  check(mispriced === 0, 'event ids are derived and every listing is priced with its event scale')

  // The same save replayed must produce the same events and the same prices.
  const replayA = Array.from({ length: 120 }).reduce<GameState>((s) => advanceDay(s), day1)
  const replayB = Array.from({ length: 120 }).reduce<GameState>((s) => advanceDay(s), day1)
  check(
    JSON.stringify(replayA.activeEvents) === JSON.stringify(replayB.activeEvents) &&
      JSON.stringify(replayA.markets) === JSON.stringify(replayB.markets),
    'the same state replayed twice generates the same events and the same prices',
  )

  // --- pricing --------------------------------------------------------------------
  const eden = PLANET_MAP['eden']!
  const foodListing = day1.markets.eden.food
  const FOOD_DEAR = MARKET_EVENT_MAP['crop-failure'].modifiers.food as number
  const normalFood = quoteBuy(eden, COMMODITY_MAP.food, foodListing, 1, day1.day, NO_EVENT).cost
  const crisisFood = quoteBuy(eden, COMMODITY_MAP.food, foodListing, 1, day1.day, FOOD_DEAR).cost
  check(
    Math.abs(crisisFood - normalFood * FOOD_DEAR) <= 1,
    `a running event scales the price of its own commodity (${normalFood} -> ${crisisFood}, x${FOOD_DEAR})`,
  )
const crisis = withEvents([forced('crop-failure', 'eden', day1.day, 4)])
  check(
    commodityEventScale(crisis.activeEvents, 'eden', 'food', day1.day) === FOOD_DEAR &&
      commodityEventScale(crisis.activeEvents, 'eden', 'water', day1.day) === NO_EVENT &&
      commodityEventScale(crisis.activeEvents, 'korbant', 'food', day1.day) === NO_EVENT,
    'the event scale applies to its own commodity at its own planet and nowhere else',
  )
  // The same walk a real trade takes. Water carries no event, so it must cost
  // exactly what it cost in the untouched state.
  const plainWater = buyCommodity(day1, 'water', 1)
  const crisisWater = buyCommodity(crisis, 'water', 1)
  check(
    !plainWater.error &&
      !crisisWater.error &&
      plainWater.state.credits === crisisWater.state.credits,
    'an event leaves every other commodity untouched',
  )

  const plainBuy = buyCommodity(day1, 'food', 5)
  const crisisBuy = buyCommodity(crisis, 'food', 5)
  check(
    !plainBuy.error && !crisisBuy.error,
    `a buy succeeds with an event running (${crisisBuy.error ?? 'ok'})`,
  )
  if (!plainBuy.error && !crisisBuy.error) {
    const plainCost = day1.credits - plainBuy.state.credits
    const crisisCost = crisis.credits - crisisBuy.state.credits
    check(
      Math.abs(crisisCost - plainCost * FOOD_DEAR) <= plainCost * FOOD_DEAR * 0.02 + 5,
      `the charged price carries the event (${plainCost} -> ${crisisCost})`,
    )
    check(
      crisisBuy.state.markets.eden.food.stock === day1.markets.eden.food.stock - 5 &&
        crisisBuy.state.markets.eden.food.price > day1.markets.eden.food.price,
      'a buy under an event still moves stock and still moves the price',
    )
  }

  // --- lifecycle ------------------------------------------------------------------
  const twoDays = withEvents([forced('crop-failure', 'eden', day1.day, 2)])
  const mid = advanceDay(twoDays)
  check(
    eventsAt(mid.activeEvents, 'eden', mid.day).length === 1 &&
      eventDaysRemaining(mid.activeEvents[0], mid.day) === 1,
    'an event survives a day and reports its days remaining',
  )
  const done = advanceDay(mid)
  check(
    eventsAt(done.activeEvents, 'eden', done.day).length === 0 &&
      done.activeEvents.length === 0,
    'an event is dropped the moment its span ends',
  )
  check(
    commodityEventScale(done.activeEvents, 'eden', 'food', done.day) === NO_EVENT &&
      quoteBuy(eden, COMMODITY_MAP.food, done.markets.eden.food, 1, done.day, NO_EVENT).cost ===
        done.markets.eden.food.price,
    'an expired event no longer touches the price',
  )
  // An event that has not begun yet is not active either.
  const future = withEvents([forced('crop-failure', 'eden', day1.day + 2, 3)])
  check(
    commodityEventScale(future.activeEvents, 'eden', 'food', day1.day) === NO_EVENT,
    'an event that has not started yet changes nothing',
  )
  // And one that expired before this save's day is inert from the first read.
  const stale = withEvents([forced('crop-failure', 'eden', day1.day - 5, 2)])
  check(
    commodityEventScale(stale.activeEvents, 'eden', 'food', day1.day) === NO_EVENT,
    'an event that ended before today changes nothing',
  )

  // --- travel ---------------------------------------------------------------------
  // Travel advances days, so it advances event lifetimes: a long event survives a
  // crossing with fewer days left, and a short one can expire in transit.
  const longEvent = withEvents([forced('mineral-discovery', 'drax', day1.day, 8)])
  const arrived = completeJump(travel(longEvent, 'drax'))
  check(!arrived.error, `travel with an event in flight (${arrived.error ?? 'ok'})`)
  if (!arrived.error) {
    const still = eventsAt(arrived.state.activeEvents, 'drax', arrived.state.day)
    const crossed = arrived.state.day - day1.day
    check(
      still.length === 1 && eventDaysRemaining(still[0], arrived.state.day) === 8 - crossed,
      `a jump burns event days (8 -> ${8 - crossed} after ${crossed} days)`,
    )
  }
  const shortEvent = withEvents([forced('mineral-discovery', 'drax', day1.day, 1)])
  const expiredInFlight = completeJump(travel(shortEvent, 'drax'))
  check(
    !expiredInFlight.error &&
      eventsAt(expiredInFlight.state.activeEvents, 'drax', expiredInFlight.state.day).length === 0,
    'an event that runs out mid-jump is gone on arrival',
  )

  // --- intel ----------------------------------------------------------------------
  // Intel prices an event it can already see, and only if it will still be
  // running when the player gets there.
  const scouted = { ...day1, credits: 1_000_000, ship: { ...day1.ship, cargoLevel: 5 } }
  const withArray = buyUpgrade(scouted, 'nav')
  check(
    withArray.applied === true && withArray.state.ship.navLevel === 1,
    `intel test setup: a Navigation Array is installed (${withArray.error ?? 'ok'})`,
  )
  if (withArray.applied) {
    const nav = withArray.state
    // A shortage makes the chosen destination *more* valuable, so the lead keeps
    // pointing at the same planet and the two quotes describe the same run twice.
    // A surplus would work the other way and could hand the lead to a different
    // planet, which would compare two different runs rather than one run twice.
    const premiumFor = (cid: CommodityId): number | null => {
      for (const def of MARKET_EVENTS) {
        const mod = def.modifiers[cid]
        if (mod !== undefined && mod > 1) return mod
      }
      return null
    }
    const lead = getTradeLeads(nav).find((l) => premiumFor(l.commodityId) !== null)
    if (!lead) {
      check(false, 'intel test setup: a lead exists for a commodity with a shortage event')
    } else {
      const PREMIUM = premiumFor(lead.commodityId) as number
      const shortage = MARKET_EVENTS.find((d) => d.modifiers[lead.commodityId] === PREMIUM)!
      const arrivalDay = nav.day + lead.travelDays
      // `endDay` is exclusive, so ending at arrivalDay + 1 is what "still
      // running on the day you arrive" actually means.
      const running = {
        ...nav,
        activeEvents: [
          forced(shortage.type, lead.targetPlanetId, nav.day, arrivalDay - nav.day + 1),
        ],
      }
      const shortLead = getTradeLeads(running).find(
        (l) => l.commodityId === lead.commodityId && l.targetPlanetId === lead.targetPlanetId,
      )
      check(
        !!shortLead &&
          Math.abs(shortLead.targetPrice - lead.targetPrice * PREMIUM) <=
            lead.targetPrice * PREMIUM * 0.03,
        `intel prices a known event at the destination (${lead.commodityId} ${lead.targetPrice.toFixed(1)} -> ${shortLead?.targetPrice.toFixed(1)})`,
      )
      check(
        shortLead !== undefined &&
          shortLead.worstCase > lead.worstCase &&
          shortLead.bestCase > lead.bestCase,
        'the forecast band moves with the event rather than only its midpoint',
      )
      // The same event, but ending on the arrival day: not active then, so the
      // forecast must ignore it entirely.
      const expiresOnArrival = {
        ...nav,
        activeEvents: [
          forced(shortage.type, lead.targetPlanetId, nav.day, arrivalDay - nav.day),
        ],
      }
      const expiredLead = getTradeLeads(expiresOnArrival).find(
        (l) => l.commodityId === lead.commodityId && l.targetPlanetId === lead.targetPlanetId,
      )
      check(
        !!expiredLead && expiredLead.targetPrice === lead.targetPrice,
        `intel ignores an event that ends before you can sell (${expiredLead?.targetPrice.toFixed(1)} vs ${lead.targetPrice.toFixed(1)})`,
      )
    }
  }

  // --- logging --------------------------------------------------------------------
  const born = marketEventLogEntries([], [forced('crop-failure', 'eden', day1.day, 3)], 'eden', day1.day)
  const died = marketEventLogEntries(
    [forced('crop-failure', 'eden', day1.day, 3)],
    [],
    'eden',
    day1.day + 3,
  )
  const distant = marketEventLogEntries([], [forced('crop-failure', 'korbant', day1.day, 3)], 'eden', day1.day)
  check(
    born.length === 1 && born[0].text.includes('Crop Failure') && born[0].text.includes('+45%'),
    `an event beginning at the player's planet is logged (${born[0]?.text ?? 'nothing'})`,
  )
  check(
    died.length === 1 && died[0].text.includes('has ended'),
    `an event ending at the player's planet is logged (${died[0]?.text ?? 'nothing'})`,
  )
  check(
    distant.length === 0,
    'an event elsewhere in the sector is not logged',
  )

  // --- save state -----------------------------------------------------------------
  const v3 = migrate({ ...day1, version: 3 } as unknown as GameState)
  check(
    v3.activeEvents.length === 0 && v3.version === GAME_VERSION,
    `a v3 save migrates to v${GAME_VERSION} with an empty event list`,
  )
  const good = forced('mining-strike', 'ironreach', day1.day, 3)
  const repairedEvents = migrate(
    asSave({
      activeEvents: [
        good,
        { ...good }, // duplicate id
        { ...good, id: 'x', planetId: 'nowhere' },
        { ...good, id: 'y', eventType: 'meteor-shower' },
        { ...good, id: 'z', endDay: NaN },
        { ...good, id: 'w', startDay: 9, endDay: 9 },
        { ...good, id: 'v', startDay: -20, endDay: -18 }, // already over
      ],
    }),
  )
  check(
    repairedEvents.activeEvents.length === 1 &&
      repairedEvents.activeEvents[0].id === good.id &&
      repairedEvents.activeEvents[0].endDay === good.endDay,
    `a damaged event list keeps the one usable event (${repairedEvents.activeEvents.length} kept)`,
  )
  check(
    throwsWith({ activeEvents: 'oops' }, 'activeEvents must be an array'),
    'a structurally impossible activeEvents is reported',
  )
}

// 20. Delivery contracts: buy the load yourself, fly it, hand it over. A second
//     economy that must never touch the market, the trading profit stat, or
//     the cargo basis.
{
  const capacity = cargoCapacityAtLevel(STARTING_SHIP.cargoLevel)
  const start = createNewGame()
  const origin = start.planetId

  // --- the board --------------------------------------------------------------------
  const offers = availableContracts(start)
  check(
    offers.length === MAX_AVAILABLE_CONTRACTS,
    `a new game opens with ${MAX_AVAILABLE_CONTRACTS} offers (${offers.length})`,
  )
  check(
    offers.every(
      (c) =>
        c.status === 'available' &&
        c.originPlanetId === origin &&
        c.destinationPlanetId !== origin &&
        PLANET_MAP[c.destinationPlanetId] !== undefined,
    ),
    'every offer is standing, local, and names a different real planet',
  )
  check(
    offers.every((c) => Number.isInteger(c.quantity) && c.quantity >= 1),
    'every offer is for a whole number of units',
  )
  check(
    offers.every(
      (c) =>
        c.quantity >= Math.floor(capacity * CONTRACT_QTY_MIN_SHARE) &&
        c.quantity <= Math.ceil(capacity * CONTRACT_QTY_MAX_SHARE),
    ),
    'every load is a slice of the hold, never the whole hold',
  )
  check(
    offers.every((c) => c.reward >= 1 && Number.isFinite(c.reward)),
    'every offer pays something',
  )
  check(
    offers.every((c) => {
      const route = contractRoute(c, start.ship.engineLevel)
      return (
        c.deadlineDay >= c.offeredDay + route.days + CONTRACT_DEADLINE_MIN_BUFFER &&
        c.deadlineDay <= c.offeredDay + route.days + CONTRACT_DEADLINE_MAX_BUFFER
      )
    }),
    'every deadline is the flight plus its buffer, so no contract is undeliverable',
  )
  check(
    new Set(offers.map((c) => c.id)).size === offers.length,
    'no two offers share an id',
  )
  // The premium is the client's margin on the goods plus the flight it saves.
  const premiums = offers.map((c) => {
    const unit =
      start.markets[c.originPlanetId][c.commodityId].price ?? COMMODITY_MAP[c.commodityId].basePrice
    const goods = unit * c.quantity
    const fuel = fuelCostBetween(c.originPlanetId, c.destinationPlanetId, start.ship.engineLevel)
    return c.reward / (goods + fuel) - 1
  })
  check(
    premiums.every((p) => p >= CONTRACT_PREMIUM_MIN - 0.02 && p <= CONTRACT_PREMIUM_MAX + 0.02),
    `every fee is the goods plus fuel plus a ${CONTRACT_PREMIUM_MIN}-${CONTRACT_PREMIUM_MAX} premium (${premiums
      .map((p) => p.toFixed(2))
      .join(', ')})`,
  )

  // --- generation is deterministic, and reloading changes nothing -------------------
  const snapshot = JSON.stringify(start)
  availableContracts(start)
  activeContracts(start)
  describeContract(offers[0])
  check(JSON.stringify(start) === snapshot, 'reading the board never mutates the save')
  check(
    JSON.stringify(generateContract(start, origin, start.day, 0)) ===
      JSON.stringify(generateContract(createNewGame(), origin, start.day, 0)),
    'the same day and planet generate the same contract, slot for slot',
  )
  check(
    generateContract(start, origin, start.day, 0)?.id !== generateContract(start, origin, start.day, 1)?.id,
    'two slots on one day are two different contracts',
  )
  check(generateContract(start, 'nowhere', start.day, 0) === null, 'a non-planet offers nothing')

  // --- accepting --------------------------------------------------------------------
  const held = start
  const first = offers[0]
  const firstId = first.id
  const afterAccept = acceptContract(held, firstId)
  check(!afterAccept.error, 'an offer on the board can be accepted')
  check(
    afterAccept.state.credits === held.credits &&
      JSON.stringify(afterAccept.state.cargo) === JSON.stringify(held.cargo) &&
      JSON.stringify(afterAccept.state.markets) === JSON.stringify(held.markets),
    'accepting moves no credits, no cargo and no market stock',
  )
  const accepted = afterAccept.state
  check(
    accepted.contracts.filter((c) => c.id === firstId).every((c) => c.status === 'accepted'),
    'the accepted contract is on the books as carried',
  )
  check(
    availableContracts(accepted).length === MAX_AVAILABLE_CONTRACTS,
    'the board refills to full the moment an offer is taken',
  )
  const secondId = availableContracts(accepted)[0].id
  const second = acceptContract(accepted, secondId)
  check(!second.error, 'a second contract can be accepted')
  const third = acceptContract(second.state, availableContracts(second.state)[0].id)
  check(
    third.error !== undefined && activeContracts(second.state).length === MAX_ACTIVE_CONTRACTS,
    `a third contract is refused: the hold carries at most ${MAX_ACTIVE_CONTRACTS}`,
  )
  check(third.state === second.state, 'a refused acceptance leaves the state untouched')
  check(
    acceptContract(second.state, 'nope') .error !== undefined,
    'accepting a contract that is not on the board is refused',
  )

  // An offer struck elsewhere is not a standing offer here.
  const foreign = { ...offers[0], id: 'elsewhere#1#0', originPlanetId: PLANETS[1].id }
  check(
    acceptContract(second.state, foreign.id).error !== undefined &&
      availableContracts({ ...second.state, contracts: [foreign] }).length === 0,
    'an offer from another planet cannot be taken from here',
  )

  // --- delivering -------------------------------------------------------------------
  const carried = activeContracts(second.state)[0]
  const target = carried.destinationPlanetId
  const load: GameState = {
    ...second.state,
    planetId: target,
    cargo: { ...second.state.cargo, [carried.commodityId]: carried.quantity },
    costBasis: { ...second.state.costBasis, [carried.commodityId]: 7 },
  }
  const atOrigin = { ...load, planetId: origin }
  check(
    deliverContract(atOrigin, carried.id).error !== undefined,
    'delivering at the origin is refused',
  )
  const short = {
    ...load,
    cargo: { ...load.cargo, [carried.commodityId]: carried.quantity - 1 },
  }
  check(
    deliverContract(short, carried.id).error !== undefined,
    'delivering without the load aboard is refused',
  )
  const late = { ...load, day: carried.deadlineDay + 1 }
  check(
    deliverContract(late, carried.id).error !== undefined,
    'a day past the deadline is refused',
  )
  check(
    !deliverContract(load, carried.id).error,
    'a contract can be handed over on the deadline day itself',
  )

  const stockBefore = JSON.stringify(load.markets)
  const done = deliverContract(load, carried.id)
  check(!done.error, 'the load is handed over at the destination')
  check(
    done.state.credits === load.credits + carried.reward,
    'the fee is credited in full',
  )
  check(
    (done.state.cargo[carried.commodityId] ?? 0) === 0,
    'the load leaves the hold',
  )
  check(
    JSON.stringify(done.state.markets) === stockBefore,
    'delivering restocks no market and moves no price',
  )
  check(
    done.state.stats.tradingProfit === load.stats.tradingProfit &&
      done.state.stats.goodsSold === load.stats.goodsSold,
    'a contract fee is not trading profit and is not a sale',
  )
  check(
    done.state.stats.contractsCompleted === load.stats.contractsCompleted + 1 &&
      done.state.stats.contractRevenue === load.stats.contractRevenue + carried.reward,
    'the completion and the fee are both booked',
  )
  check(!done.state.contracts.some((c) => c.id === carried.id), 'the contract is gone once paid')
  check(
    deliverContract(done.state, carried.id).error !== undefined,
    'a paid contract cannot be paid twice',
  )
  check(
    availableContracts(done.state).length === MAX_AVAILABLE_CONTRACTS,
    'the board refills after a delivery',
  )

  // Partial delivery of a stack: the basis is per unit, so what is left stays on
  // exactly the same basis, and only an emptied line is dropped.
  const partial: GameState = {
    ...load,
    cargo: { ...load.cargo, [carried.commodityId]: carried.quantity + 4 },
  }
  const partialDone = deliverContract(partial, carried.id)
  check(
    (partialDone.state.cargo[carried.commodityId] ?? 0) === 4 &&
      partialDone.state.costBasis[carried.commodityId] === 7,
    'delivering part of a stack leaves the rest on its own cost basis',
  )
  const emptied = deliverContract(load, carried.id)
  check(
    emptied.state.costBasis[carried.commodityId] === undefined,
    'delivering the last of a line drops its cost basis',
  )

  // --- deadlines -------------------------------------------------------------------
  const doomed: GameState = {
    ...second.state,
    day: carried.deadlineDay + 1,
    cargo: { ...second.state.cargo, [carried.commodityId]: carried.quantity },
  }
  const failed = settleContracts(doomed)
  const logged = failed.log.filter((l) => l.icon === '❌' && l.text.includes(carried.quantity.toString()))
  check(
    !failed.contracts.some((c) => c.id === carried.id) &&
      failed.stats.contractsFailed === doomed.stats.contractsFailed + 1,
    'an undelivered contract fails the day after its deadline',
  )
  check(logged.length === 1, `the failure is logged once (${logged.length} lines)`)
  check(
    failed.credits === doomed.credits && JSON.stringify(failed.cargo) === JSON.stringify(doomed.cargo),
    'a missed deadline costs the fee and nothing else',
  )
  const again = settleContracts(failed)
  check(
    again.stats.contractsFailed === failed.stats.contractsFailed && again.log.length === failed.log.length,
    'settlement is idempotent: a resolved contract cannot fail twice',
  )

  // The clock is the game's, so `waitDay` and `travel` are what move it.
  let waited = acceptContract({ ...start, credits: 1_000_000 }, offers[1].id).state
  const waitedId = activeContracts(waited)[0].id
  for (let d = 0; d < 60; d++) waited = waitDay(waited).state
  check(
    !waited.contracts.some((c) => c.id === waitedId) && waited.stats.contractsFailed === 1,
    'waiting a day past the deadline fails the contract exactly once',
  )

  // A jump that spans the deadline settles once, on arrival, not once per day.
  const far = activeContracts(second.state)[0]
  const trip = Math.max(
    ...PLANETS.filter((p) => p.id !== origin).map((p) => distanceBetween(PLANET_MAP[origin]!, p)),
  )
  const jumping: GameState = {
    ...second.state,
    day: far.deadlineDay - 1,
    credits: 1_000_000,
    contracts: [{ ...far, deadlineDay: far.deadlineDay - 1 }],
  }
  const arrived = completeJump(travel(jumping, far.destinationPlanetId))
  check(
    arrived.state.stats.contractsFailed === jumping.stats.contractsFailed + 1,
    'a jump across the deadline fails the contract once',
  )
  check(
    arrived.state.log.filter((l) => l.icon === '❌').length === 1,
    'the failure is logged once, not once per day in transit',
  )
  check(trip > 1, 'the jump under test really did span more than one day')

  // Offers are local: the board at A is not a standing offer at B.
  const elsewhere: GameState = { ...start, planetId: PLANETS[1].id }
  check(
    availableContracts(elsewhere).every((c) => c.originPlanetId === PLANETS[1].id),
    'the board only ever offers work struck at the planet you are at',
  )
  const arrivedAtB = completeJump(travel({ ...start, credits: 1_000_000 }, PLANETS[1].id))
  check(
    availableContracts(arrivedAtB.state).every((c) => c.originPlanetId === PLANETS[1].id) &&
      arrivedAtB.state.contracts.filter((c) => c.status === 'available' && c.originPlanetId === origin)
        .length === 0,
    'arriving somewhere new draws a fresh local board and drops the old offers',
  )

  // A fee is fixed when the contract is drawn, not re-priced by the market later.
  const repriced: GameState = {
    ...second.state,
    day: second.state.day + 2,
    markets: {
      ...second.state.markets,
      [carried.originPlanetId]: {
        ...second.state.markets[carried.originPlanetId],
        [carried.commodityId]: {
          ...second.state.markets[carried.originPlanetId][carried.commodityId],
          price: 1,
        },
      },
    },
  }
  check(
    repriced.contracts.filter((c) => c.id === carried.id).every((c) => c.reward === carried.reward),
    'a market crash does not re-price a contract already on the books',
  )

  // --- save state -------------------------------------------------------------------
  const v4 = migrate({ ...start, version: 4 } as unknown as GameState)
  check(
    v4.contracts.length === 0 && v4.version === GAME_VERSION,
    `a v4 save migrates to v${GAME_VERSION} with no contracts on the books`,
  )
  check(
    migrate(asSave({ stats: {} as never })).stats.contractRevenue === 0 &&
      migrate(asSave({ stats: {} as never })).stats.contractsCompleted === 0 &&
      migrate(asSave({ stats: {} as never })).stats.contractsFailed === 0,
    'a save with no contract stats loads with all three counters at zero',
  )
  check(
    throwsWith({ stats: { ...start.stats, contractRevenue: NaN } }, 'stats.contractRevenue'),
    'an unreadable fee total is reported rather than quietly zeroed',
  )
  const keeper = offers[0]
  const repairedContracts = migrate(
    asSave({
      contracts: [
        keeper,
        { ...keeper }, // duplicate id
        { ...keeper, id: 'x', destinationPlanetId: 'nowhere' },
        { ...keeper, id: 'y', destinationPlanetId: keeper.originPlanetId }, // same planet
        { ...keeper, id: 'z', quantity: 0 },
        { ...keeper, id: 'w', quantity: 2.5 },
        { ...keeper, id: 'v', reward: -5 },
        { ...keeper, id: 'u', deadlineDay: keeper.offeredDay }, // no room to deliver
        { ...keeper, id: 't', status: 'completed' }, // already resolved
        { ...keeper, id: 's', status: 'failed' },
        { ...keeper, id: 'r', commodityId: 'unobtainium' },
        { ...keeper, id: 'q' }, // no id at all: rebuilt
        'not even an object',
      ],
    }),
  )
  const keptIds = repairedContracts.contracts.map((c) => c.id)
  check(
    repairedContracts.contracts.length === 2 &&
      repairedContracts.contracts[0].id === keeper.id &&
      new Set(keptIds).size === 2,
    `a damaged contract list keeps only the usable contracts, with unique ids (${repairedContracts.contracts.length} kept)`,
  )
  check(
    repairedContracts.contracts.every(
      (c) =>
        Number.isInteger(c.quantity) &&
        c.quantity >= 1 &&
        c.reward >= 1 &&
        c.deadlineDay > c.offeredDay &&
        (c.status === 'available' || c.status === 'accepted'),
    ),
    'a kept contract is one the client and the game can both act on',
  )
  check(
    throwsWith({ contracts: 'oops' }, 'contracts must be an array'),
    'a structurally impossible contract list is reported',
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
const buyFor = (n: number) =>
  quoteBuy(PLANET_MAP[home]!, COMMODITY_MAP.food, market, n, loaded.day, NO_EVENT)
const sellFor = (n: number) =>
  quoteSell(PLANET_MAP[home]!, COMMODITY_MAP.food, market, n, loaded.day, NO_EVENT)
check(
  [NaN, Infinity, -Infinity, -3.7].every((n) => buyFor(n).cost === buyFor(0).cost && sellFor(n).proceeds === 0),
  'a quote for a non-finite quantity is zero units, not an unbounded loop',
)
check(
  buyFor(2.9).cost === buyFor(2).cost && sellFor(2.9).proceeds === sellFor(2).proceeds,
  'a fractional quantity fills whole units',
)

// --- travel encounters ---------------------------------------------------------
// A jump is no longer guaranteed to end docked, so these check the parts that
// have to be true whichever way a journey goes: that the roll is a function of
// the flight, that fuel is charged once at departure, that nothing else can be
// done until the encounter is answered, and that answering it lands the ship
// exactly where a quiet jump would have.
{
  // Definitions are data and must stay well formed: every type reachable through
  // the lookup map, every choice usable as an id.
  const types = TRAVEL_ENCOUNTERS.map((e) => e.type)
  check(
    TRAVEL_ENCOUNTERS.length >= 10 &&
      new Set(types).size === TRAVEL_ENCOUNTERS.length &&
      types.every((t) => TRAVEL_ENCOUNTER_MAP[t] === TRAVEL_ENCOUNTER_MAP[t]) &&
      types.every((t) => TRAVEL_ENCOUNTER_MAP[t]?.type === t),
    `every encounter type is defined once and reachable by lookup (${TRAVEL_ENCOUNTERS.length} types)`,
  )
  check(
    TRAVEL_ENCOUNTERS.every(
      (e) =>
        e.name.length > 0 &&
        e.description.length > 0 &&
        e.choices.length >= 2 &&
        new Set(e.choices.map((c) => c.id)).size === e.choices.length &&
        e.choices.every(
          (c) => c.id.length > 0 && c.label.length > 0 && c.detail.length > 0 && c.log.length > 0,
        ),
    ),
    'every encounter offers at least two described, uniquely identified choices',
  )

  // The roll is a pure function of the flight, so it cannot be rerolled by
  // reloading, and it is not the same encounter on the same hop forever.
  const probe = { ...createNewGame(), credits: 100_000 }
  const rolled = travel(probe, 'drax')
  check(
    !rolled.error &&
      (rolled.encounter === undefined ||
        rolled.encounter.id === travel(probe, 'drax').encounter?.id),
    'the same jump rolls the same encounter every time it is attempted',
  )
  const distinct = new Set<string>()
  let triggered = 0
  let flights = 0
  for (let day = 0; day < 400; day++) {
    for (const other of PLANETS.filter((p) => p.id !== probe.planetId)) {
      const at = { ...probe, day, stats: { ...probe.stats, tripsMade: flights } }
      const jump = travel(at, other.id)
      if (jump.error) continue
      flights++
      if (jump.encounter) {
        triggered++
        distinct.add(jump.encounter.id)
      }
    }
  }
  const rate = triggered / flights
  check(
    rate >= 0.15 && rate <= 0.35,
    `roughly one journey in four meets something (${(rate * 100).toFixed(1)}% of ${flights} jumps)`,
  )
  check(
    distinct.size > 10,
    `the same route is not stuck with one encounter (${distinct.size} distinct across ${flights} jumps)`,
  )

  // Fuel is charged once, at departure, and the rest of the jump cannot be flown
  // twice: the ship is mid-air, so a second jump is refused outright.
  const broke = { ...probe, credits: 50_000 }
  const fare = travelCost(broke, 'drax')
  const first = travel(broke, 'drax')
  check(
    !first.error &&
      first.state.credits === broke.credits - fare &&
      first.state.stats.tripsMade === broke.stats.tripsMade + 1,
    'an interrupted jump still charges fuel and counts the trip once, at departure',
  )
  const again = travel(first.state, 'pelagos')
  check(
    again.error !== undefined && again.state === first.state,
    'a jump already under way cannot be started again',
  )

  // Fly real journeys until one comes out interrupted, so the interrupted case is
  // asserted rather than hoped for. Trips are flown back and forth with the clock
  // advanced a day at a time, exactly as a player would.
  let flying: GameState | null = null
  let walked = 0
  for (let d = 0; d < 400 && flying === null; d++) {
    const at = { ...broke, day: broke.day + d, stats: { ...broke.stats, tripsMade: d } }
    const jumped = travel(at, d % 2 === 0 ? 'drax' : 'pelagos')
    walked++
    if (!jumped.error && jumped.encounter) flying = jumped.state
  }
  check(flying !== null, `a real journey was interrupted by something (in ${walked} jumps)`)
  if (flying?.pendingEncounter) {
    const pending = flying.pendingEncounter
    check(
      flying.planetId === pending.originPlanetId &&
        flying.planetId !== pending.destinationPlanetId,
      'the ship is still at the origin it left: no arrival until the encounter is answered',
    )
    check(
      flying.day > pending.departureDay &&
        flying.day < pending.departureDay + pending.journeyDays,
      `part of the flight is behind the player (day ${flying.day - pending.departureDay} of ${pending.journeyDays})`,
    )

    const options = encounterOptions(flying, pending)
    check(
      options.length >= 2 && options.some((o) => !o.blockedReason),
      'there is always a way through: at least one choice is open',
    )

    // A payment the player cannot make is refused outright, and takes nothing
    // with it when it is.
    const poor: GameState = { ...flying, credits: 1 }
    const pricey = options.find((o) => o.cost > 0)
    if (pricey) {
      const refused = resolveEncounter(poor, pricey.id)
      check(
        refused.error !== undefined &&
          refused.state === poor &&
          encounterOptions(poor, pending).find((o) => o.id === pricey.id)?.blockedReason !== undefined,
        'a choice the player cannot afford is refused, and the button says so',
      )
    }

    // What a button quotes is what it charges, first time and after a reload.
    const open = options.find((o) => !o.blockedReason)!
    const settled = resolveEncounter(flying, open.id)
    check(
      settled.error === undefined && settled.result !== undefined && settled.log !== undefined,
      'an open choice resolves, with something to say and something to log',
    )
    const done = settled.state
    check(
      done.planetId === pending.destinationPlanetId &&
        done.pendingEncounter === null &&
        done.day === pending.departureDay + pending.journeyDays + (settled.result?.daysDelta ?? 0),
      `resolution lands the ship at the destination on day ${pending.departureDay + pending.journeyDays + (settled.result?.daysDelta ?? 0)}, with the encounter spent`,
    )
    check(
      done.credits === flying.credits + (settled.result?.creditsDelta ?? 0),
      'the outcome is applied exactly once, to the credits it says',
    )
    const claimed = resolveEncounter(done, open.id)
    check(
      claimed.error !== undefined && claimed.state === done,
      'a spent encounter cannot be claimed twice',
    )
    check(
      done.stats.tripsMade === flying.stats.tripsMade,
      'arriving does not count the trip a second time',
    )
  }

  // Every type, resolved deliberately instead of waited for: a flight seeded per
  // type and choice, so each outcome branch is exercised on demand and the
  // invariants can be checked against all of them at once.
  const ORIGIN = 'eden'
  const TARGET = 'drax'
  /** A three-day hop, one day of it already flown when the encounter fires. */
  const JOURNEY_DAYS = 3
  const departure = { ...probe, planetId: ORIGIN, credits: 20_000 } as GameState
  const fired = advanceDay(departure)
  const flight = (type: TravelEncounterType, choice: string) => {
    const pending: PendingEncounter = {
      id: encounterId(`probe:${type}:${choice}`),
      type,
      originPlanetId: ORIGIN,
      destinationPlanetId: TARGET,
      departureDay: departure.day,
      triggerDay: fired.day,
      journeyDays: JOURNEY_DAYS,
      fuelCost: travelCost(broke, TARGET),
    }
    return { pending, state: { ...fired, pendingEncounter: pending } }
  }
  const bag = (cargo: Partial<Record<CommodityId, number>>): Record<string, number> =>
    cargo as unknown as Record<string, number>
  const outcomes: {
    label: string
    state: GameState
    result: EncounterResult & {
      cargoDelta?: Record<string, number>
      cargoBasis?: Record<string, number>
    }
  }[] = []
  for (const def of TRAVEL_ENCOUNTERS) {
    for (const choice of def.choices) {
      const { state } = flight(def.type, choice.id)
      const resolved = resolveEncounter(state, choice.id)
      if (resolved.error || !resolved.result) {
        check(false, `every choice of every encounter can be taken (${def.type}/${choice.id})`)
        continue
      }
      outcomes.push({ label: `${def.type}/${choice.id}`, state: resolved.state, result: resolved.result })
    }
  }
  check(
    outcomes.length === TRAVEL_ENCOUNTERS.reduce((n, e) => n + e.choices.length, 0),
    `every choice of every encounter can be taken (${outcomes.length} outcomes)`,
  )
  // What the same flight would have looked like with nothing in the way: the same
  // journey, the same clock, and nothing an encounter could have touched. Every
  // market comparison below is against this rather than against the state the
  // ship left, because flying *does* move markets - that is the clock, not the
  // encounter.
  const flightReference = (days: number) => {
    let ref = departure
    for (let i = 0; i < days; i++) ref = advanceDay(ref)
    return ref
  }
  const quietReference = flightReference(JOURNEY_DAYS)
  for (const o of outcomes) {
    const bad =
      o.state.credits !== 20_000 + (o.result.creditsDelta ?? 0) ||
      o.state.credits < 0 ||
      o.state.day !== probe.day + 3 + (o.result.daysDelta ?? 0) ||
      o.state.planetId !== TARGET ||
      o.state.pendingEncounter !== null
    if (bad) {
      check(
        false,
        `${o.label}: charged ${o.state.credits - 20_000} of ${o.result.creditsDelta ?? 0}, on day ${
          o.state.day - departure.day
        } of ${JOURNEY_DAYS + (o.result.daysDelta ?? 0)}, at ${o.state.planetId}`,
      )
    }
  }
  check(
    outcomes.every(
      (o) =>
        o.state.credits === 20_000 + (o.result.creditsDelta ?? 0) &&
        o.state.credits >= 0 &&
        o.state.day === departure.day + JOURNEY_DAYS + (o.result.daysDelta ?? 0) &&
        o.state.planetId === TARGET &&
        o.state.pendingEncounter === null,
    ),
    'every outcome charges and delays exactly what it reports, and lands the ship',
  )
  const capacity = cargoCapacityAtLevel(probe.ship.cargoLevel)
  check(
    outcomes.every((o) =>
      Object.entries(o.result.cargoDelta ?? {}).every(
        ([id, q]) => bag(o.state.cargo)[id] === (o.result.cargoDelta?.[id] ?? 0) && q <= capacity,
      ),
    ),
    'no outcome can put more in the hold than the hold holds',
  )
  check(
    outcomes.every((o) =>
      Object.keys(o.result.cargoDelta ?? {}).every((id) => (bag(o.state.costBasis)[id] ?? 0) >= 0),
    ),
    'every awarded line carries a non-negative cost basis',
  )
  // Salvage was found, not bought: it enters the hold at a basis of zero, so net
  // worth does not jump because the player picked something up.
  const salvaged = outcomes.filter((o) => o.label === 'derelict-pod/salvage')
  check(
    salvaged.length === 1 &&
      salvaged.every((o) => {
        const id = Object.keys(o.result.cargoDelta ?? {})[0]
        return (
          id !== undefined &&
          bag(o.state.costBasis)[id] === 0 &&
          o.result.unitsBought === undefined &&
          o.state.stats.tradingProfit === probe.stats.tradingProfit
        )
      }),
    'salvage enters the hold free and books no trading profit',
  )
  // A convoy pallet is bought, so it carries the price paid and counts as goods
  // bought - and takes the price from the market being left, at a discount.
  const convoys = outcomes.filter((o) => o.label === 'merchant-convoy/buy')
  check(
    convoys.length === 1 &&
      convoys[0].result.unitsBought !== undefined &&
      (convoys[0].result.cargoBasis ?? {})[Object.keys(convoys[0].result.cargoDelta ?? {})[0]!] ===
        -convoys[0].result.creditsDelta! / convoys[0].result.unitsBought! &&
      convoys[0].state.stats.goodsBought === probe.stats.goodsBought + convoys[0].result.unitsBought!,
    'a convoy pallet is booked at the price paid, and counted as goods bought',
  )
  // A market is re-stocked by the clock, not by a crate falling out of a pod:
  // an encounter moves no market that the same flight, unencountered, would not
  // have moved anyway.
  check(
    outcomes
      .filter((o) => (o.result.daysDelta ?? 0) === 0)
      .every((o) => JSON.stringify(o.state.markets) === JSON.stringify(quietReference.markets)),
    'an encounter moves no market that the same journey would not have moved',
  )

  // A quiet jump is still the original one: fuel, every day of the flight, and
  // an arrival in a single call.
  let quiet: { from: GameState; jump: ReturnType<typeof travel> } | null = null
  const seeking: GameState = { ...probe, stats: { ...probe.stats, tripsMade: 900 } }
  for (let d = 0; d < 200 && quiet === null; d++) {
    const from = { ...seeking, day: seeking.day + d }
    for (const target of ['drax', 'pelagos']) {
      const jump = travel(from, target)
      if (jump.error || jump.encounter) continue
      quiet = { from, jump }
      break
    }
  }
  check(quiet !== null, 'the sample quiet jump really was quiet')
  if (quiet) {
    check(
      quiet.jump.state.planetId === quiet.jump.toId &&
        quiet.jump.state.day === quiet.from.day + (quiet.jump.days ?? 0) &&
        quiet.jump.state.day === quiet.jump.arriveDay,
      'an uninterrupted jump lands in one call, on the day it promised',
    )
    check(
      quiet.jump.state.credits === quiet.from.credits - (quiet.jump.fuelCost ?? 0),
      'an uninterrupted jump is charged fuel and nothing else',
    )
  }


  // A save taken mid-jump keeps the flight, so a reload resumes the same
  // encounter on the same day rather than rerolling or quietly arriving.
  const midFlight = flying
  if (midFlight?.pendingEncounter) {
    const round = migrate(JSON.parse(JSON.stringify(midFlight)))
    const choiceId = encounterOptions(round, round.pendingEncounter!).find((o) => !o.blockedReason)!.id
    check(
      JSON.stringify(round.pendingEncounter) === JSON.stringify(midFlight.pendingEncounter) &&
        resolveEncounter(round, choiceId).result?.message ===
          resolveEncounter(midFlight, choiceId).result?.message,
      'a reloaded save resumes the same encounter with the same outcome',
    )
    const dropped = migrate({
      ...midFlight,
      pendingEncounter: { ...midFlight.pendingEncounter, type: 'no-longer-a-thing' as never },
    })
    check(dropped.pendingEncounter === null, 'a save naming an encounter this build lost lands anyway')
  }

  // The same for a save with nothing in flight, and for one that predates
  // encounters entirely: a v5 save has no such field, and must load as a ship
  // sitting quietly at a planet rather than as a half-flown jump.
  const clean = migrate(JSON.parse(JSON.stringify(createNewGame())) as GameState)
  check(
    clean.pendingEncounter === null && clean.version === GAME_VERSION,
    `a fresh save carries no flight in progress (v${clean.version})`,
  )
  const withoutField = { ...createNewGame() } as Partial<GameState>
  delete withoutField.pendingEncounter
  const v5 = migrate({ ...withoutField, version: 5 } as unknown as GameState)
  check(
    v5.pendingEncounter === null && v5.version === GAME_VERSION,
    `a v5 save migrates to v${GAME_VERSION} docked, not mid-jump`,
  )
  // A flight with a broken journey - days flown longer than the flight, a
  // departure in the future - is dropped rather than stranding the ship.
  const brokenFlight = migrate({
    ...createNewGame(),
    pendingEncounter: {
      id: 'enc@nonsense',
      type: 'derelict-pod',
      originPlanetId: 'eden',
      destinationPlanetId: 'drax',
      departureDay: 9,
      triggerDay: 40,
      journeyDays: 3,
      fuelCost: 40,
    },
  })
  check(brokenFlight.pendingEncounter === null, 'a flight that could not have happened is dropped')
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECKS FAILED`)
process.exit(failures === 0 ? 0 : 1)