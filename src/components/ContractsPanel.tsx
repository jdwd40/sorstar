import type { ReactNode } from 'react'
import type { CommodityId, Contract, GameState } from '../types/game'
import { COMMODITY_MAP, MAX_ACTIVE_CONTRACTS, PLANET_MAP, PLANET_TYPE_META } from '../data/gameData'
import {
  activeContracts,
  availableContracts,
  contractRoute,
  describeContract,
  routeFromHere,
} from '../services/contractService'
import { cargoFree, quoteBuy } from '../services/marketService'
import { commodityEventScale } from '../services/marketEventService'
import { fmt, fmtMoney } from '../utils/format'
import type { ActionResult } from '../context/GameContext'

interface ContractsPanelProps {
  game: GameState
  acceptContract: (contractId: string) => ActionResult
  deliverContract: (contractId: string) => ActionResult
}

/**
 * What a load would cost to buy at the planet the player is at, right now.
 *
 * A real quote rather than the listed price, because the listed price is the
 * *first* unit's price: buying a contract's worth in one order moves the market
 * against the player, and a hint that ignored that would send them to the trade
 * tab with the wrong number in their head. Not shared with `contractService`
 * because `marketService` imports that service and cannot import back.
 */
function localBuyCost(game: GameState, commodityId: CommodityId, qty: number): number {
  const planet = PLANET_MAP[game.planetId]
  const listing = game.markets[game.planetId]?.[commodityId]
  if (!planet || !listing) return 0
  const scale = commodityEventScale(game.activeEvents, planet.id, commodityId, game.day)
  return quoteBuy(planet, COMMODITY_MAP[commodityId], listing, qty, game.day, scale).cost
}

function commodityName(commodityId: CommodityId): string {
  return COMMODITY_MAP[commodityId]?.name ?? commodityId
}

/** "3 days left" / "due today", coloured by how little room is left. */
function Deadline({ game, contract }: { game: GameState; contract: Contract }) {
  const left = contract.deadlineDay - game.day
  const tone = left <= 0 ? 'text-red-400' : left <= 2 ? 'text-amber-400' : 'text-slate-400'
  return (
    <span className={tone}>
      {left <= 0 ? 'due today' : `${fmt(left)} day${left === 1 ? '' : 's'} left`}
    </span>
  )
}

/** One contract: who wants what, where it has to go, and what it pays. */
function ContractCard({
  game,
  contract,
  children,
}: {
  game: GameState
  contract: Contract
  children: ReactNode
}) {
  const { title, client, description } = describeContract(contract)
  const planet = PLANET_MAP[contract.destinationPlanetId]
  const icon = planet ? PLANET_TYPE_META[planet.type]?.icon : null
  const route = contractRoute(contract, game.ship.engineLevel)

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-white text-sm">{title}</div>
          <div className="text-xs text-slate-500">{client}</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-emerald-400 text-sm">{fmtMoney(contract.reward)}</div>
          <div className="text-xs text-slate-500">
            <Deadline game={game} contract={contract} /> · Day {fmt(contract.deadlineDay)}
          </div>
        </div>
      </div>

      <div className="text-xs text-slate-400">
        <span className="text-slate-200 font-medium">
          {fmt(contract.quantity)}× {commodityName(contract.commodityId)}
        </span>{' '}
        → {icon ? <span className="mr-0.5">{icon}</span> : null}
        {planet?.name ?? contract.destinationPlanetId} · {fmt(route.days)} ly ·{' '}
        {fmt(route.fuelCost)} cr fuel
      </div>

      <div className="text-xs text-slate-500 italic">“{description}”</div>

      {children}
    </div>
  )
}

export default function ContractsPanel({
  game,
  acceptContract,
  deliverContract,
}: ContractsPanelProps) {
  const offers = availableContracts(game)
  const active = activeContracts(game)
  const atCap = active.length >= MAX_ACTIVE_CONTRACTS

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-indigo-300">📜 Delivery Contracts</h3>
          <div className="text-xs text-slate-400">
            {active.length}/{MAX_ACTIVE_CONTRACTS} carried · {offers.length} on offer here
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Buy the load yourself on the origin market, fly it, and hand it over at the
          destination. Accepting a contract moves nothing — the goods, the fuel and the
          deadline are all yours to manage.
        </p>
      </div>

      <div className="card p-4 space-y-3">
        <h4 className="text-sm font-semibold text-slate-300">Carried ({active.length})</h4>
        {active.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing on the books.</p>
        ) : (
          active.map((contract) => (
            <ActiveContractCard
              key={contract.id}
              game={game}
              contract={contract}
              deliver={() => deliverContract(contract.id)}
            />
          ))
        )}
      </div>

      <div className="card p-4 space-y-3">
        <h4 className="text-sm font-semibold text-slate-300">On offer here ({offers.length})</h4>
        {offers.length === 0 ? (
          <p className="text-sm text-slate-500">No work on offer at this planet.</p>
        ) : (
          offers.map((contract) => (
            <OfferCard
              key={contract.id}
              game={game}
              contract={contract}
              blocked={atCap}
              accept={() => acceptContract(contract.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ActiveContractCard({
  game,
  contract,
  deliver,
}: {
  game: GameState
  contract: Contract
  deliver: () => ActionResult
}) {
  const destination = PLANET_MAP[contract.destinationPlanetId]?.name ?? contract.destinationPlanetId
  const here = game.planetId === contract.destinationPlanetId
  const short = Math.max(0, contract.quantity - (game.cargo[contract.commodityId] ?? 0))
  const ready = here && short === 0

  return (
    <ContractCard game={game} contract={contract}>
      {here ? (
        short > 0 ? (
          <div className="text-xs text-amber-400">
            Here, but {fmt(short)}× {commodityName(contract.commodityId)} short. Buy the
            difference on this market.
          </div>
        ) : null
      ) : (
        <RouteHint game={game} contract={contract} />
      )}
      <button
        onClick={deliver}
        disabled={!ready}
        className={`w-full px-3 py-2 rounded text-sm font-semibold transition-colors ${
          ready
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
        }`}
      >
        {ready
          ? `Deliver for ${fmtMoney(contract.reward)} cr`
          : here
            ? `Need ${fmt(short)} more aboard`
            : `Deliver at ${destination}`}
      </button>
    </ContractCard>
  )
}

/** What the load still has to be bought for, or what the flight still costs. */
function RouteHint({ game, contract }: { game: GameState; contract: Contract }) {
  if (game.planetId !== contract.originPlanetId) {
    const route = routeFromHere(game, contract)
    return (
      <div className="text-xs text-slate-400">
        Fly {fmt(route.days)} ly to{' '}
        {PLANET_MAP[contract.destinationPlanetId]?.name ?? contract.destinationPlanetId} (
        {fmt(route.fuelCost)} cr fuel)
      </div>
    )
  }

  const cost = localBuyCost(game, contract.commodityId, contract.quantity)
  const free = cargoFree(game)
  const aboard = game.cargo[contract.commodityId] ?? 0

  return (
    <div className="text-xs text-slate-400 space-y-0.5">
      <div>
        Buy {fmt(contract.quantity - aboard)}× {commodityName(contract.commodityId)} on this
        market for {fmtMoney(cost)} cr
        {free < contract.quantity - aboard ? (
          <span className="text-amber-400"> — hold has room for {fmt(free)}</span>
        ) : null}
        {cost > game.credits ? <span className="text-amber-400"> — short of credits</span> : null}
      </div>
      {aboard > 0 ? <div className="text-slate-500">Already aboard: {fmt(aboard)}×</div> : null}
    </div>
  )
}

function OfferCard({
  game,
  contract,
  blocked,
  accept,
}: {
  game: GameState
  contract: Contract
  blocked: boolean
  accept: () => ActionResult
}) {
  const route = contractRoute(contract, game.ship.engineLevel)
  const buyCost = localBuyCost(game, contract.commodityId, contract.quantity)
  const origin = PLANET_MAP[contract.originPlanetId]?.name ?? contract.originPlanetId

  return (
    <ContractCard game={game} contract={contract}>
      <div className="text-xs text-slate-400 space-y-0.5">
        <div>
          Offered at {origin} · the load costs {fmtMoney(buyCost)} cr on this market
        </div>
        <div className="text-slate-500">
          ≈ {fmtMoney(contract.reward - buyCost - route.fuelCost)} cr over goods and fuel
        </div>
      </div>
      <button
        onClick={accept}
        disabled={blocked}
        className={`w-full px-3 py-2 rounded text-sm font-semibold transition-colors ${
          blocked
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        }`}
      >
        {blocked ? `Carrying ${MAX_ACTIVE_CONTRACTS} contracts` : 'Accept contract'}
      </button>
    </ContractCard>
  )
}