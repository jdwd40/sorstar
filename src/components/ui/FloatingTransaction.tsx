import { useEffect, useRef, type ReactNode } from 'react'
import { fmtMoney } from '../../utils/format'
import { IconCheck, IconTrade } from './Icons'

export interface TransactionFeedback {
  id: number
  kind: 'buy' | 'sell'
  /** What was traded, e.g. "Sold 4 × Medicine". */
  title: string
  /** Signed credits that moved: negative on a purchase. */
  amount: number
  /** One line each, e.g. the units gained, the profit realised. */
  lines: { label: string; value: ReactNode; tone?: 'good' | 'bad' | 'muted' }[]
}

const LINE_TONE: Record<'good' | 'bad' | 'muted', string> = {
  good: 'text-emerald-300',
  bad: 'text-rose-300',
  muted: 'text-slate-300',
}

interface FloatingTransactionProps {
  feedback: TransactionFeedback
  onExpire: (id: number) => void
}

/**
 * The answer to a trade, in the two numbers the player actually asked for.
 *
 * A purchase used to report "Purchase complete." and a sale "Sale complete." -
 * both true, both useless, while the interesting figures (what it cost, what it
 * made, what the profit over basis was) were one re-read of the table away. This
 * puts them in front of the player for a moment and then gets out of the way:
 * one animation cycle, at most three at a time so a fast trader sees every
 * receipt, and nothing left behind to re-read.
 */
function FloatingTransaction({ feedback, onExpire }: FloatingTransactionProps) {
  const { id, kind, title, amount, lines } = feedback

  // The page hands over a fresh closure every render, so keeping it out of the
  // timer means a trade, a tab switch or anything else re-rendering the page
  // cannot restart the countdown on a receipt that is already on its way out.
  const expireRef = useRef(onExpire)
  expireRef.current = onExpire

  useEffect(() => {
    const timer = window.setTimeout(() => expireRef.current(id), 2800)
    return () => window.clearTimeout(timer)
  }, [id])

  const buy = kind === 'buy'

  return (
    <div
      className={`transaction-in pointer-events-none w-[min(20rem,calc(100vw-2rem))] rounded-xl border p-3 shadow-2xl backdrop-blur-md ${
        buy
          ? 'border-indigo-400/40 bg-slate-950/90 shadow-indigo-950/60'
          : 'border-emerald-400/40 bg-slate-950/90 shadow-emerald-950/60'
      }`}
      role="status"
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full ${
            buy ? 'bg-indigo-500/20 text-indigo-300' : 'bg-emerald-500/20 text-emerald-300'
          }`}
        >
          {buy ? <IconTrade className="h-3 w-3" /> : <IconCheck className="h-3 w-3" />}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          {title}
        </span>
      </div>
      <div
        className={`num mt-1 text-2xl font-black leading-none ${
          buy ? 'text-indigo-200 text-glow' : 'text-emerald-300 text-glow'
        }`}
      >
        {amount >= 0 ? '+' : ''}
        {fmtMoney(amount)}
      </div>
      {lines.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {lines.map((line) => (
            <div
              key={line.label}
              className={`flex items-baseline justify-between gap-3 text-[11px] ${
                LINE_TONE[line.tone ?? 'muted']
              }`}
            >
              <span className="text-slate-400">{line.label}</span>
              <span className="num font-semibold">{line.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The toast stack. Pointer-transparent, and clear of the sticky header. */
export default function FloatingTransactions({
  items,
  onExpire,
}: {
  items: TransactionFeedback[]
  onExpire: (id: number) => void
}) {
  if (items.length === 0) return null
  return (
    <div
      className="pointer-events-none fixed left-1/2 top-28 z-50 flex -translate-x-1/2 flex-col items-center gap-2 sm:top-20"
    >
      {items.map((item) => (
        <FloatingTransaction key={item.id} feedback={item} onExpire={onExpire} />
      ))}
    </div>
  )
}
