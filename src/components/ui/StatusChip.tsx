import type { ReactNode } from 'react'

interface StatusChipProps {
  label: string
  value: ReactNode
  icon?: ReactNode
  /** Fill fraction for a thin meter beside the value, 0-1. */
  meter?: number
  /** Tailwind text colour for the value. */
  tone?: string
  /** Tailwind gradient stops for the meter. */
  meterTone?: string
  /** Responsive classes for the label, for headers that get tight. */
  labelClassName?: string
  title?: string
  className?: string
}

/**
 * One readout in the HUD: an icon, a name, a number, optionally a meter.
 *
 * The top of the game shows the same handful of figures on every screen and on
 * every tab, so they are built once here rather than re-laid-out per panel.
 */
export default function StatusChip({
  label,
  value,
  icon,
  meter,
  tone = 'text-white',
  meterTone = 'from-cyan-400 to-indigo-400',
  labelClassName = '',
  title,
  className = '',
}: StatusChipProps) {
  return (
    <div className={`chip ${className}`} title={title}>
      {icon && <span className="text-slate-400">{icon}</span>}
      <span
        className={`uppercase tracking-wide text-[10px] text-slate-400 ${labelClassName}`}
      >
        {label}
      </span>
      <span className={`num font-bold ${tone}`}>{value}</span>
      {meter !== undefined && (
        <span className="meter w-8" aria-hidden="true">
          <span
            className={`meter-fill bg-gradient-to-r ${meterTone}`}
            style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%` }}
          />
        </span>
      )}
    </div>
  )
}

/** The block form, for a panel header where a chip would be too small to read. */
export function StatTile({
  label,
  value,
  hint,
  tone = 'text-white',
  title,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: string
  title?: string
}) {
  return (
    <div className="stat-tile" title={title}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`num text-base font-bold leading-tight ${tone}`}>{value}</div>
      {hint && <div className="text-[10px] leading-tight text-slate-500">{hint}</div>}
    </div>
  )
}
