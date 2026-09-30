import { useMemo, useState } from 'react'
import type { CommodityId, GameState, Planet } from '../types/game'
import {
  COMMODITIES,
  PLANET_TYPE_META,
  cargoCapacityAtLevel,
  dailyUpkeep,
} from '../data/gameData'
import { cargoFree, cargoUsed, priceDirection, quoteBuy, quoteSell } from '../services/marketService'
import { fmt, fmtMoney } from '../utils/format'
import type { ActionResult } from '../context/GameContext'

interface MarketPanelProps {
  game: GameState
  planet: Planet
  buy: (commodityId: CommodityId, qty: number) => ActionResult
  sell: (commodityId: CommodityId, qty: number) => ActionResult
  waitDay: () => void
}

function priceBand(price: number, base: number, mod: number): 'cheap' | 'fair' | 'dear' {
  const fair = base * mod
  const ratio = price / fair
  if (ratio <= 0.85) return 'cheap'
  if (ratio >= 1.15) return 'dear'
  return 'fair'
}

const PRICE_COLOR: Record<'cheap' | 'fair' | 'dear', string> = {
  cheap: 'text-emerald-400',
  fair: 'text-white',
  dear: 'text-red-400',
}

const ARROW: Record<'up' | 'down' | 'flat', string> = {
  up: '▲',
  down: '▼',
  flat: '·',
}

const ARROW_COLOR: Record<'up' | 'down' | 'flat', string> = {
  up: 'text-emerald-400',
  down: 'text-red-400',
  flat: 'text-slate-500',
}

export default function MarketPanel({ game, planet, buy, sell, waitDay }: MarketPanelProps) {
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const capacity = cargoCapacityAtLevel(game.ship.cargoLevel)
  const used = cargoUsed(game)
  const free = cargoFree(game)
  const upkeep = dailyUpkeep(game.ship)
  const canPayUpkeep = game.credits >= upkeep
  const meta = PLANET_TYPE_META[planet.type]

  const rows = useMemo(() => {
    return COMMODITIES.map((commodity) => {
      const owned = game.cargo[commodity.id]
      const inputStr = inputs[commodity.id] ?? '1'
      const parsedQty = Number(inputStr)
      const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? Math.floor(parsedQty) : 0

      const listing = game.markets[planet.id]?.[commodity.id]

      // Quote through the same helpers the trade functions use, so the cost
      // shown here is the cost charged. The buy price rises as stock is
      // drained, so the affordable maximum needs a bisection, not a divide.
      const maxByCredits = (() => {
        if (!listing) return 0
        let lo = 0
        let hi = Math.floor(game.credits / Math.max(1, listing.price))
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2)
          if (quoteBuy(planet, commodity, listing, mid, game.day).cost <= game.credits) lo = mid
          else hi = mid - 1
        }
        return lo
      })()
      const maxBuy = Math.max(0, Math.min(listing?.stock ?? 0, free, maxByCredits))

      const buyQuote = listing
        ? quoteBuy(planet, commodity, listing, qty, game.day)
        : { unitPrice: 0, cost: 0 }
      const buyCost = qty > 0 ? buyQuote.cost : 0
      const canBuy = qty > 0 && qty <= maxBuy
      const canSell = qty > 0 && qty <= owned
      const sellValue = listing ? quoteSell(planet, commodity, listing, qty, game.day).proceeds : 0

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
        canBuy,
        canSell,
        sellValue,
        buyTooltip,
        band,
        dir,
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
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{planet.icon}</span>
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                {planet.name}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-slate-800 ${meta.color}`}>
                  {meta.icon} {planet.type}
                </span>
              </h2>
              <p className="text-slate-400 text-sm max-w-xl">{planet.description}</p>
            </div>
          </div>
          <div className="text-right text-sm text-slate-300">
            <div>
              Population:{' '}
              <span className="text-white font-semibold">{planet.population.toLocaleString()}</span>
            </div>
            <button
              onClick={waitDay}
              title={
                canPayUpkeep
                  ? undefined
                  : `Only ${game.credits} cr on hand - upkeep will be paid down to that.`
              }
              className="btn-ghost mt-2 text-xs"
            >
              Wait one day
              <span className="ml-1 text-slate-400">
                ({upkeep} cr upkeep{canPayUpkeep ? '' : ', partial'})
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-indigo-300">Market</h3>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Credits</span>
              <span className="text-emerald-400 font-bold">{fmtMoney(game.credits)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Cargo</span>
              <span className="text-white font-bold">
                {fmt(used)}/{fmt(capacity)}
              </span>
              <span className="text-slate-500 text-xs">
                {Math.round((used / Math.max(1, capacity)) * 100)}%
              </span>
              {free === 0 && <span className="text-red-400 text-xs">FULL</span>}
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500" title="Price moves vs yesterday">
              <span className="text-emerald-400">▲</span> up
              <span className="text-red-400">▼</span> down
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="py-2 pr-4">Good</th>
                <th className="py-2 pr-4 text-right">Price</th>
                <th className="py-2 pr-4 text-right">Stock</th>
                <th className="py-2 pr-4 text-right">Owned</th>
                <th className="py-2 pr-4 text-right">Qty</th>
                <th className="py-2 pr-4 text-center">Buy</th>
                <th className="py-2 text-center">Sell</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(
                ({ commodity, listing, owned, qty, inputStr, buyCost, canBuy, canSell, sellValue, buyTooltip, band, dir }) => (
                  <tr key={commodity.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{commodity.icon}</span>
                        <div>
                          <div className="text-white font-medium">{commodity.name}</div>
                          <div className="text-xs text-slate-500">{commodity.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <div className={`font-semibold ${listing ? PRICE_COLOR[band] : 'text-slate-500'}`}>
                        {fmtMoney(listing?.price ?? 0)}
                      </div>
                      {listing && (
                        <div
                          className={`text-[10px] ${ARROW_COLOR[dir]}`}
                          title={
                            dir === 'flat'
                              ? 'unchanged vs yesterday'
                              : `moved by ${dir === 'up' ? '+' : ''}${fmt(listing.price - listing.prevPrice)} cr vs yesterday`
                          }
                        >
                          <span className={dir === 'flat' ? 'text-slate-400' : ''}>{ARROW[dir]}</span>{' '}
                          {listing.price > 0 ? Math.round(((listing.price - listing.prevPrice) / Math.max(1, listing.prevPrice)) * 100) : 0}%
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-300">
                      {listing ? fmt(listing.stock) : '—'}
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-300">
                      {owned > 0 ? <span className="text-cyan-300 font-semibold">{fmt(owned)}</span> : '0'}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <input
                        type="number"
                        min={1}
                        value={inputStr}
                        onChange={(e) => setQty(commodity.id, e.target.value)}
                        className="input-sm text-right"
                      />
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <button
                        onClick={() => handleBuy(commodity.id, qty)}
                        disabled={!canBuy}
                        title={buyTooltip}
                        className="btn-primary px-3 py-1 text-xs"
                      >
                        Buy
                      </button>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {canBuy ? `${fmtMoney(buyCost)}` : '—'}
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => handleSell(commodity.id, qty)}
                        disabled={!canSell}
                        title={owned === 0 ? 'Nothing to sell' : `Sell ${qty} for ${fmtMoney(sellValue)}`}
                        className="btn-ghost px-3 py-1 text-xs"
                      >
                        Sell
                      </button>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {canSell ? `${fmtMoney(sellValue)}` : '—'}
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        {game.credits <= 0 && (
          <div className="mt-4 p-3 rounded-lg bg-red-900/40 border border-red-700/50 text-red-200 text-sm">
            You are out of credits. Sell cargo for some quick cash, or wait a day for
            prices to shift.
          </div>
        )}
      </div>
    </div>
  )
}