import { useEffect, useRef, type ReactNode } from 'react'
import { fmtMoney } from '../../utils/format'
import { IconCheck, IconTrade } from './Icons'

type Tone = 'good' | 'bad' | 'muted' | 'info'

export interface TransactionFeedback {
  id: number
  kind: 'buy' | 'sell'
  /** What was traded, e.g. "Sold 4 × Medicine". */
  title: string
  /** Signed credits that moved: negative on a purchase. */
  amount: number
  /** The second number a trader wants: "+8 Medicine", "+210 cr profit". */
  headline?: { text: string; tone: Tone }
  /** Small print under it, e.g. the fill price. */
  lines: { label: string; value: ReactNode; tone?: Tone }[]
}

// A loss is amber rather than red: worth noticing, not an alarm.
const LINE_TONE: Record<Tone, string> = {
  good: 'text-emerald-300',
  bad: 'text-amber-300',
  muted: 'text-slate-300',
  info: 'text-cyan-200',
}

interface FloatingTransactionProps {
  feedback: TransactionFeedback
  onExpire: (id: number) => void
}

/**
 * The answer to a trade, in the two numbers the player actually asked for.
 *
 * One animation cycle, at most three at a time so a fast trader sees every
 * receipt, and nothing left behind to re-read.
 */
function FloatingTransaction({ feedback, onExpire }: FloatingTransactionProps) {
  const { id, kind, title, amount, headline, lines } = feedback

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
      className={`transaction-in pointer-events-none w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border p-3 shadow-2xl backdrop-blur-md ${
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
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span
          className={`num text-2xl font-black leading-none text-glow ${
            buy ? 'text-indigo-100' : 'text-emerald-300'
          }`}
        >
          {amount >= 0 ? '+' : ''}
          {fmtMoney(amount)}
        </span>
        {headline && (
          <span className={`num text-base font-bold leading-none ${LINE_TONE[headline.tone]}`}>
            {headline.text}
          </span>
        )}
      </div>
      {lines.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-slate-700/50 pt-1.5">
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
