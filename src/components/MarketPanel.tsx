import { useMemo, useState } from 'react'
import type { CommodityId, GameState, Planet } from '../types/game'
import { COMMODITIES, PLANET_TYPE_META, cargoCapacityAtLevel } from '../data/gameData'
import { cargoFree, cargoUsed, priceDirection, quoteBuy, quoteSell } from '../services/marketService'
import { commodityEventScale } from '../services/marketEventService'
import { fmt, fmtMoney } from '../utils/format'
import type { ActionResult } from '../context/GameContext'
import GameBadge from './ui/GameBadge'
import MarketAlert from './ui/MarketAlert'
import { moveTone } from './ui/marketBadges'
import { IconPlanetType } from './ui/Icons'

interface MarketPanelProps {
  game: GameState
  planet: Planet
  buy: (commodityId: CommodityId, qty: number) => ActionResult
  sell: (commodityId: CommodityId, qty: number) => ActionResult
}

function priceBand(price: number, base: number, mod: number): 'cheap' | 'fair' | 'dear' {
  const fair = base * mod
  const ratio = price / fair
  if (ratio <= 0.85) return 'cheap'
  if (ratio >= 1.15) return 'dear'
  return 'fair'
}

const PRICE_COLOR: Record<'cheap' | 'fair' | 'dear', string> = {
  cheap: 'text-emerald-300',
  fair: 'text-white',
  dear: 'text-rose-300',
}

const ARROW: Record<'up' | 'down' | 'flat', string> = {
  up: '▲',
  down: '▼',
  flat: '·',
}

const ARROW_COLOR: Record<'up' | 'down' | 'flat', string> = {
  up: 'text-emerald-300',
  down: 'text-rose-300',
  flat: 'text-slate-500',
}

/**
 * The market.
 *
 * Every number here is the number the trade services will charge: the quotes
 * come from `quoteBuy`/`quoteSell` with the same event multiplier those
 * functions apply, and the affordable maximum is found by bisecting the same
 * quote rather than by dividing credits by a price that then rises as the order
 * fills. So the table can be read before the button is pressed and still be
 * true afterwards.
 */
export default function MarketPanel({ game, planet, buy, sell }: MarketPanelProps) {
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const meta = PLANET_TYPE_META[planet.type]
  const capacity = cargoCapacityAtLevel(game.ship.cargoLevel)
  const free = cargoFree(game)
  const used = cargoUsed(game)

  const rows = useMemo(() => {
    return COMMODITIES.map((commodity) => {
      const owned = game.cargo[commodity.id]
      const inputStr = inputs[commodity.id] ?? '1'
      const parsedQty = Number(inputStr)
      const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? Math.floor(parsedQty) : 0

      const listing = game.markets[planet.id]?.[commodity.id]
      // Quoted with the same event multiplier the trade services apply, so a
      // price shown during a shortage is the price that will be charged.
      const eventScale = commodityEventScale(game.activeEvents, planet.id, commodity.id, game.day)

      // The buy price rises as stock is drained, so the affordable maximum needs
      // a bisection, not a divide.
      const maxByCredits = (() => {
        if (!listing) return 0
        let lo = 0
        let hi = Math.floor(game.credits / Math.max(1, listing.price))
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          if (quoteBuy(planet, commodity, listing, mid, game.day, eventScale).cost <= game.credits) lo = mid
          else hi = mid - 1
        }
        return lo
      })()
      const maxBuy = Math.max(0, Math.min(listing?.stock ?? 0, free, maxByCredits))

      const buyQuote = listing
        ? quoteBuy(planet, commodity, listing, qty, game.day, eventScale)
        : { unitPrice: 0, cost: 0 }
      const buyCost = qty > 0 ? buyQuote.cost : 0
      const canBuy = qty > 0 && qty <= maxBuy
      const canSell = qty > 0 && qty <= owned
      const sellQuote = listing
        ? quoteSell(planet, commodity, listing, qty, game.day, eventScale)
        : { proceeds: 0 }
      const sellValue = sellQuote.proceeds

      let buyTooltip = `Buy ${qty} for ${fmtMoney(buyCost)}`
      if (!canBuy) {
        if (!listing || listing.stock < qty) buyTooltip = 'Not enough stock on this market'
        else if (free <= 0) buyTooltip = 'Cargo hold is full'
        else if (game.credits < buyCost) buyTooltip = `Need ${fmtMoney(buyCost - game.credits)} more credits`
        else buyTooltip = 'Cannot buy that quantity'
      }

      const band = listing ? priceBand(listing.price, commodity.basePrice, planet.priceMods[commodity.id]) : 'fair'
      const dir = listing ? priceDirection(listing) : 'flat'

      return {
        commodity,
        listing,
        owned,
        qty,
        inputStr,
        maxBuy,
        buyCost,
        buyUnit: buyQuote.unitPrice,
        canBuy,
        canSell,
        sellValue,
        buyTooltip,
        band,
        dir,
        // An event on this good is visible on the alert strip above; here it
        // just marks the row, coloured by the sign of the multiplier.
        eventPct: eventScale === 1 ? 0 : Math.round((eventScale - 1) * 100),
        eventScale,
      }
    })
  }, [game, planet, inputs, free])

  const setQty = (id: string, raw: string) => {
    setInputs((prev) => ({ ...prev, [id]: raw }))
  }

  const handleBuy = (id: CommodityId, qty: number) => {
    if (qty <= 0) return
    const res = buy(id, qty)
    if (res.ok) setQty(id, '1')
  }

  const handleSell = (id: CommodityId, qty: number) => {
    if (qty <= 0) return
    const res = sell(id, qty)
    if (res.ok) setQty(id, '1')
  }

  return (
    <div className="space-y-4">
      <MarketAlert game={game} planet={planet} />

      <div className="card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="panel-heading text-indigo-300/90">Market</h3>
            <p className="mt-0.5 flex items-center gap-2 text-sm text-slate-300">
              <span className="font-semibold text-white">{planet.name}</span>
              <span className={`flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide ${meta.color}`}>
                <IconPlanetType type={planet.type} className="h-3 w-3" />
                {planet.type}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span title="A ▲ or ▼ means the price moved while you were away">
              <span className="text-emerald-300">▲</span> dearer ·{' '}
              <span className="text-rose-300">▼</span> cheaper
            </span>
            <span className="sm:hidden">swipe the table →</span>
          </div>
        </div>

        <div className="table-wrap -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="table-head">
                <th className="th">Good</th>
                <th className="th text-right">Price</th>
                <th className="th text-right">Stock</th>
                <th className="th text-right">Held</th>
                <th className="th text-right">Qty</th>
                <th className="th text-center">Buy</th>
                <th className="th text-center">Sell</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(
                ({
                  commodity,
                  listing,
                  owned,
                  qty,
                  inputStr,
                  maxBuy,
                  buyCost,
                  buyUnit,
                  canBuy,
                  canSell,
                  sellValue,
                  buyTooltip,
                  band,
                  dir,
                  eventPct,
                  eventScale,
                }) => (
                  <tr key={commodity.id} className="row row-hover">
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <span className="text-xl" aria-hidden="true">
                          {commodity.icon}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-white">{commodity.name}</span>
                            {eventPct !== 0 && (
                              <GameBadge
                                tone={moveTone(eventScale)}
                                title="A market event is moving this price"
                              >
                                {eventPct > 0 ? '+' : ''}
                                {eventPct}%
                              </GameBadge>
                            )}
                          </div>
                          <div className="hidden max-w-[16rem] text-xs text-slate-500 sm:block">
                            {commodity.description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="td text-right">
                      {/* Re-keyed on the price so a move re-flashes the cell on the
                          day it happens rather than once on first paint. */}
                      <div
                        key={`${commodity.id}-${listing?.price ?? 0}`}
                        className={`-mx-1 rounded px-1 font-semibold ${PRICE_COLOR[band]} ${
                          dir === 'up'
                            ? 'price-flash-up'
                            : dir === 'down'
                              ? 'price-flash-down'
                              : ''
                        }`}
                      >
                        {fmtMoney(listing?.price ?? 0)}
                      </div>
                      {listing && (
                        <div
                          className={`num text-[10px] ${ARROW_COLOR[dir]}`}
                          title={
                            dir === 'flat'
                              ? 'unchanged vs yesterday'
                              : `moved by ${dir === 'up' ? '+' : ''}${fmt(
                                  listing.price - listing.prevPrice,
                                )} cr vs yesterday`
                          }
                        >
                          <span>{ARROW[dir]}</span>{' '}
                          {listing.price > 0
                            ? Math.round(
                                ((listing.price - listing.prevPrice) / Math.max(1, listing.prevPrice)) * 100,
                              )
                            : 0}
                          %
                        </div>
                      )}
                    </td>
                    <td className="td text-right">
                      <div className="num text-slate-300">{listing ? fmt(listing.stock) : '—'}</div>
                      {listing && listing.stockMax > 0 && (
                        <div className="meter ml-auto mt-1 w-12" aria-hidden="true">
                          <div
                            className={`meter-fill ${
                              listing.stock <= listing.stockMax * 0.15
                                ? 'bg-rose-400'
                                : listing.stock <= listing.stockMax * 0.4
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400/80'
                            }`}
                            style={{ width: `${Math.min(100, (listing.stock / listing.stockMax) * 100)}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="td text-right">
                      {owned > 0 ? (
                        <div>
                          <div className="num font-semibold text-cyan-200">{fmt(owned)}</div>
                          <div
                            className="meter ml-auto mt-1 w-10"
                            aria-hidden="true"
                            title={`${fmt(owned)} of ${fmt(cargoUsed(game))} cargo bays`}
                          >
                            <div
                              className="meter-fill bg-cyan-400/70"
                              style={{
                                width: `${Math.min(100, (owned / Math.max(1, cargoUsed(game))) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="td text-right">
                      <input
                        type="number"
                        min={1}
                        value={inputStr}
                        onChange={(e) => setQty(commodity.id, e.target.value)}
                        className="input-sm num w-16 text-right sm:w-20"
                        aria-label={`Quantity of ${commodity.name}`}
                      />
                      <button
                        onClick={() => setQty(commodity.id, String(maxBuy > 0 ? maxBuy : 1))}
                        disabled={maxBuy <= 0}
                        className="mt-0.5 block w-full text-[9px] uppercase tracking-wider text-slate-500 hover:text-indigo-300 disabled:text-slate-700"
                        title="Fill in the most you can afford here, and the most this market has"
                      >
                        max
                      </button>
                    </td>
                    <td className="td text-center">
                      <button
                        onClick={() => handleBuy(commodity.id, qty)}
                        disabled={!canBuy}
                        title={buyTooltip}
                        className="btn-primary btn-sm w-full"
                      >
                        Buy
                      </button>
                      <div className="num mt-1 whitespace-nowrap text-[10px] text-slate-400">
                        {canBuy ? (
                          <>
                            {fmtMoney(buyCost)}
                            <span className="text-slate-600"> · {fmtMoney(buyUnit)}/u</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </div>
                    </td>
                    <td className="td text-center">
                      <button
                        onClick={() => handleSell(commodity.id, qty)}
                        disabled={!canSell}
                        title={owned === 0 ? 'Nothing to sell' : `Sell ${qty} for ${fmtMoney(sellValue)}`}
                        className="btn-ghost btn-sm w-full"
                      >
                        Sell
                      </button>
                      <div className="num mt-1 whitespace-nowrap text-[10px] text-slate-400">
                        {canSell ? fmtMoney(sellValue) : '—'}
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            Hold: <span className="num text-slate-300">{fmt(used)}</span> of{' '}
            <span className="num text-slate-300">{fmt(capacity)}</span> bays used
            {free === 0 ? <span className="ml-1 font-semibold text-rose-300">— FULL</span> : null}
          </span>
          <span className="sm:hidden">swipe the table →</span>
        </div>

        {game.credits <= 0 && (
          <div className="mt-4 rounded-lg border border-rose-700/50 bg-rose-900/40 p-3 text-sm text-rose-200">
            You are out of credits. Sell cargo for some quick cash, or wait a day for
            prices to shift.
          </div>
        )}
      </div>
    </div>
  )
}