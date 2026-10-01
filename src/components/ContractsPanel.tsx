import type { ReactNode } from 'react'
import type { CommodityId, Contract, GameState } from '../types/game'
import { COMMODITY_MAP, MAX_ACTIVE_CONTRACTS, PLANET_MAP } from '../data/gameData'
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
import PlanetVisual from './ui/PlanetVisual'
import GameBadge, { type BadgeTone } from './ui/GameBadge'
import { IconContract, IconScroll } from './ui/Icons'

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

/** "3 days left" / "due today", as a badge coloured by how little room is left. */
function Deadline({ game, contract }: { game: GameState; contract: Contract }) {
  const left = contract.deadlineDay - game.day
  const tone: BadgeTone = left <= 0 ? 'danger' : left <= 2 ? 'warn' : 'neutral'
  return (
    <GameBadge tone={tone} title={`Deadline is day ${fmt(contract.deadlineDay)}`}>
      {left <= 0 ? 'due today' : `${fmt(left)}d left`}
    </GameBadge>
  )
}

/** How much of the load is actually in the hold, which is the whole question. */
function LoadMeter({ have, need }: { have: number; need: number }) {
  const fill = need > 0 ? Math.min(1, have / need) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="meter flex-1" aria-hidden="true">
        <div
          className={`meter-fill bg-gradient-to-r ${
            fill >= 1 ? 'from-emerald-400 to-cyan-300' : 'from-indigo-400 to-cyan-300'
          }`}
          style={{ width: `${fill * 100}%` }}
        />
      </div>
      <span
        className={`num text-[11px] font-semibold ${
          fill >= 1 ? 'text-emerald-300' : 'text-slate-400'
        }`}
        title={`${fmt(have)} of ${fmt(need)} aboard`}
      >
        {fmt(have)}/{fmt(need)}
      </span>
    </div>
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
  const route = contractRoute(contract, game.ship.engineLevel)
  const aboard = game.cargo[contract.commodityId] ?? 0

  return (
    <div className="space-y-2 rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="text-xs text-slate-500">{client}</div>
        </div>
        <div className="text-right">
          <div className="num text-sm font-bold text-emerald-300">{fmtMoney(contract.reward)}</div>
          <div className="mt-0.5 flex justify-end">
            <Deadline game={game} contract={contract} />
          </div>
        </div>
      </div>

      {/* The job, in one line: this much of that good, over there. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
        <span className="font-semibold text-slate-200">
          <span aria-hidden="true">{COMMODITY_MAP[contract.commodityId]?.icon}</span>{' '}
          {fmt(contract.quantity)}× {commodityName(contract.commodityId)}
        </span>
        <span className="text-slate-600">→</span>
        <span className="flex items-center gap-1 font-medium text-slate-200">
          <PlanetVisual planet={planet} size="xs" />
          {planet?.name ?? contract.destinationPlanetId}
        </span>
        <span className="num text-slate-500">
          {fmt(route.days)} ly · {fmtMoney(route.fuelCost)} cr fuel
        </span>
      </div>

      <LoadMeter have={aboard} need={contract.quantity} />

      <div className="text-xs italic text-slate-500">“{description}”</div>

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
          <h3 className="flex items-center gap-2 text-lg font-semibold text-indigo-300">
            <IconContract className="h-4 w-4" />
            Delivery contracts
          </h3>
          <div className="flex items-center gap-1.5">
            <GameBadge tone={atCap ? 'warn' : 'info'} title="Contracts you have accepted">
              {active.length}/{MAX_ACTIVE_CONTRACTS} carried
            </GameBadge>
            <GameBadge tone="neutral" title="Jobs on offer at this planet">
              {offers.length} on offer
            </GameBadge>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Buy the load yourself on the origin market, fly it, and hand it over at the
          destination. Accepting a contract moves nothing — the goods, the fuel and the
          deadline are all yours to manage.
        </p>
      </div>

      <div className="card space-y-3 p-4">
        <h4 className="panel-heading">Carried · {fmt(active.length)}</h4>
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

      <div className="card space-y-3 p-4">
        <h4 className="panel-heading">On offer here · {fmt(offers.length)}</h4>
        {offers.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <IconScroll className="h-4 w-4" />
            No work on offer at this planet.
          </p>
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
          <div className="text-xs text-amber-300">
            Here, but {fmt(short)}× {commodityName(contract.commodityId)} short. Buy the
            difference on this market.
          </div>
        ) : (
          <div className="text-xs text-emerald-300">Full load aboard, at the destination.</div>
        )
      ) : (
        <RouteHint game={game} contract={contract} />
      )}
      <button
        onClick={deliver}
        disabled={!ready}
        className={`w-full rounded px-3 py-2 text-sm font-semibold transition-colors ${
          ready ? 'btn-success' : 'btn-ghost text-slate-500'
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
      <div className="num text-xs text-slate-400">
        Fly {fmt(route.days)} ly to{' '}
        {PLANET_MAP[contract.destinationPlanetId]?.name ?? contract.destinationPlanetId} (
        {fmtMoney(route.fuelCost)} cr fuel)
      </div>
    )
  }

  const cost = localBuyCost(game, contract.commodityId, contract.quantity)
  const free = cargoFree(game)
  const aboard = game.cargo[contract.commodityId] ?? 0

  return (
    <div className="space-y-0.5 text-xs text-slate-400">
      <div>
        Buy {fmt(contract.quantity - aboard)}× {commodityName(contract.commodityId)} on this
        market for {fmtMoney(cost)} cr
        {free < contract.quantity - aboard ? (
          <span className="text-amber-300"> — hold has room for {fmt(free)}</span>
        ) : null}
        {cost > game.credits ? <span className="text-amber-300"> — short of credits</span> : null}
      </div>
      {aboard > 0 ? (
        <div className="num text-slate-500">Already aboard: {fmt(aboard)}×</div>
      ) : null}
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
  const margin = contract.reward - buyCost - route.fuelCost

  return (
    <ContractCard game={game} contract={contract}>
      <div className="space-y-0.5 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="flex items-center gap-1">
            Offered at
            <PlanetVisual planet={PLANET_MAP[contract.originPlanetId]} size="xs" />
            <span className="font-medium text-slate-200">{origin}</span>
          </span>
          <span className="num text-slate-500">load costs {fmtMoney(buyCost)} cr here</span>
        </div>
        <div className="num text-slate-500">
          ≈ {fmtMoney(margin)} cr over goods and fuel
        </div>
      </div>
      <button
        onClick={accept}
        disabled={blocked}
        className={`w-full rounded px-3 py-2 text-sm font-semibold transition-colors ${
          blocked ? 'btn-ghost text-slate-500' : 'btn-primary'
        }`}
      >
        {blocked ? `Carrying ${MAX_ACTIVE_CONTRACTS} contracts` : 'Accept contract'}
      </button>
    </ContractCard>
  )
}