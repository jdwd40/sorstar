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
import { IconCheck, IconClock, IconContract, IconScroll } from './ui/Icons'

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

/** Days of slack a contract has before it fails: 0 means it is due today. */
function daysLeft(game: GameState, contract: Contract): number {
  return contract.deadlineDay - game.day
}

/** "3 days left" / "due today", as a badge coloured by how little room is left. */
function Deadline({ game, contract }: { game: GameState; contract: Contract }) {
  const left = daysLeft(game, contract)
  const tone: BadgeTone = left <= 0 ? 'danger' : left <= 2 ? 'warn' : 'neutral'
  return (
    <GameBadge
      tone={tone}
      pulse={left <= 1}
      icon={<IconClock className="h-3 w-3" />}
      title={`Deadline is day ${fmt(contract.deadlineDay)}`}
    >
      {left <= 0 ? 'due today' : `${fmt(left)}d left`}
    </GameBadge>
  )
}

/** How much of the load is actually in the hold, which is the whole question. */
function LoadMeter({ have, need, name }: { have: number; need: number; name: string }) {
  const fill = need > 0 ? Math.min(1, have / need) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="meter h-2 flex-1" aria-hidden="true">
        <div
          className={`meter-fill bg-gradient-to-r ${
            fill >= 1 ? 'from-emerald-400 to-cyan-300' : 'from-violet-400 to-indigo-300'
          }`}
          style={{ width: `${fill * 100}%` }}
        />
      </div>
      <span
        className={`num whitespace-nowrap text-[11px] font-semibold ${
          fill >= 1 ? 'text-emerald-300' : 'text-slate-300'
        }`}
        title={`${fmt(have)} of ${fmt(need)} aboard`}
      >
        {fmt(Math.min(have, need))} / {fmt(need)} {name}
      </span>
    </div>
  )
}

type CardState = 'ready' | 'urgent' | 'carried' | 'offer'

const CARD_STYLE: Record<CardState, string> = {
  ready: 'ready-glow border-emerald-400/50 bg-emerald-500/[0.07]',
  urgent: 'border-amber-400/45 bg-amber-500/[0.06]',
  carried: 'border-violet-400/25 bg-slate-900/50',
  offer: 'border-slate-700/70 bg-slate-900/40',
}

/** One contract: who wants what, where it has to go, and what it pays. */
function ContractCard({
  game,
  contract,
  state,
  children,
}: {
  game: GameState
  contract: Contract
  state: CardState
  children: ReactNode
}) {
  const { title, client, description } = describeContract(contract)
  const planet = PLANET_MAP[contract.destinationPlanetId]
  const route = contractRoute(contract, game.ship.engineLevel)
  const aboard = game.cargo[contract.commodityId] ?? 0
  const commodity = COMMODITY_MAP[contract.commodityId]

  return (
    <div className={`space-y-2.5 rounded-xl border p-3 ${CARD_STYLE[state]}`}>
      <div className="flex items-start gap-3">
        {/* Where it goes is the first thing to read, so the world leads. */}
        <PlanetVisual planet={planet} size="md" className="m-1 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">{title}</div>
              <div className="text-[11px] text-slate-500">{client}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="num text-base font-black leading-tight text-emerald-300">
                {fmtMoney(contract.reward)}
              </div>
              <div className="mt-0.5 flex justify-end">
                <Deadline game={game} contract={contract} />
              </div>
            </div>
          </div>

          {/* The job, in one line: this much of that good, over there. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
            <span className="font-semibold text-slate-100">
              <span aria-hidden="true">{commodity?.icon}</span> {fmt(contract.quantity)}×{' '}
              {commodityName(contract.commodityId)}
            </span>
            <span className="text-slate-500">→</span>
            <span className="font-semibold text-slate-100">
              {planet?.name ?? contract.destinationPlanetId}
            </span>
            <span className="num text-slate-500">
              · {fmt(route.days)} ly · {fmtMoney(route.fuelCost)} fuel
            </span>
          </div>
        </div>
      </div>

      <LoadMeter have={aboard} need={contract.quantity} name={commodityName(contract.commodityId)} />

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
  const state: CardState = ready ? 'ready' : daysLeft(game, contract) <= 1 ? 'urgent' : 'carried'

  return (
    <ContractCard game={game} contract={contract} state={state}>
      {here ? (
        short > 0 ? (
          <div className="text-xs text-amber-300">
            Here, but {fmt(short)}× {commodityName(contract.commodityId)} short. Buy the
            difference on this market.
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <IconCheck className="h-3.5 w-3.5" />
            Full load aboard, at the destination.
          </div>
        )
      ) : (
        <RouteHint game={game} contract={contract} />
      )}
      <button
        onClick={deliver}
        disabled={!ready}
        className={`flex w-full items-center justify-center gap-2 ${
          ready ? 'btn-success py-2.5 text-base' : 'btn-ghost btn-sm py-2 text-slate-500'
        }`}
      >
        {ready && <IconCheck className="h-4 w-4" />}
        {ready
          ? `Deliver for ${fmtMoney(contract.reward)}`
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
        {fmtMoney(route.fuelCost)} fuel)
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
        market for {fmtMoney(cost)}
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
    <ContractCard game={game} contract={contract} state="offer">
      <div className="space-y-0.5 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="flex items-center gap-1">
            Offered at
            <PlanetVisual planet={PLANET_MAP[contract.originPlanetId]} size="xs" />
            <span className="font-medium text-slate-200">{origin}</span>
          </span>
          <span className="num text-slate-500">load costs {fmtMoney(buyCost)} here</span>
        </div>
        <div className={`num ${margin >= 0 ? 'text-slate-400' : 'text-amber-300/90'}`}>
          ≈ {margin >= 0 ? '+' : '-'}
          {fmtMoney(Math.abs(margin))} over goods and fuel
        </div>
      </div>
      <button
        onClick={accept}
        disabled={blocked}
        className={`w-full py-2 text-sm ${blocked ? 'btn-ghost text-slate-500' : 'btn-primary'}`}
      >
        {blocked ? `Carrying ${MAX_ACTIVE_CONTRACTS} contracts` : 'Accept contract'}
      </button>
    </ContractCard>
  )
}