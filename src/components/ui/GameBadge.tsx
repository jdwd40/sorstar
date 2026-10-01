import type { ReactNode } from 'react'

export type BadgeTone = 'warn' | 'good' | 'info' | 'contract' | 'danger' | 'neutral'

const TONE: Record<BadgeTone, string> = {
  warn: 'bg-amber-500/15 text-amber-200 border-amber-400/40 shadow-[0_0_14px_-4px_rgba(251,191,36,0.8)]',
  good: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40',
  info: 'bg-cyan-500/15 text-cyan-200 border-cyan-400/40',
  contract: 'bg-violet-500/15 text-violet-200 border-violet-400/40',
  danger: 'bg-rose-500/15 text-rose-200 border-rose-400/40',
  neutral: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
}

interface GameBadgeProps {
  tone: BadgeTone
  children: ReactNode
  icon?: ReactNode
  title?: string
  /** A slow breath, for something that is happening right now. */
  pulse?: boolean
  className?: string
}

/**
 * A small marker: a market alert, a contract due here, a delivery ready to hand
 * over. The vocabulary the whole game shares, so an event reads the same on the
 * sector chart, in the market panel and on a contract card.
 */
export default function GameBadge({
  tone,
  children,
  icon,
  title,
  pulse = false,
  className = '',
}: GameBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-tight tracking-wide ${TONE[tone]} ${
        pulse ? 'animate-pulse' : ''
      } ${className}`}
      title={title}
    >
      {icon}
      {children}
    </span>
  )
}
