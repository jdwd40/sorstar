import type { SVGProps } from 'react'

/**
 * Tiny inline SVG icons, sized by `w-*`/`h-*` and drawn in `currentColor`.
 *
 * Interface furniture is drawn here rather than typed as emoji: emoji render at
 * different sizes and in different colours on every platform, so a tab bar
 * built from them never lines up, and a planet identity that is an emoji has
 * nothing to build a highlight or a glow around. World *type* is drawn for the
 * same reason, next to the CSS planet it sits under.
 *
 * Data that is read straight out of `gameData` keeps its emoji - commodity and
 * log-entry glyphs are part of the save's vocabulary, and they are allowed to
 * be colourful, since nothing has to align to them.
 *
 * Deliberately no icon library: eight or nine paths per icon is cheaper than a
 * dependency, and there is nothing here an icon set would draw better.
 */

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

/** Trade: a market stall of goods, for the buy/sell tab. */
export function IconTrade(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 9 5 4h14l1.5 5" />
      <path d="M3.5 9h17v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
      <path d="M9 20v-5h6v5" />
      <path d="M3.5 9 2 7M20.5 9 22 7" />
    </Svg>
  )
}

/** Travel: a chart with a plotted hop. */
export function IconTravel(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 17.5 9 11l4 3.5L21 6" />
      <circle cx="9" cy="11" r="1.6" />
      <circle cx="13" cy="14.5" r="1.6" />
      <path d="M3 21h18" />
    </Svg>
  )
}

/** Contracts: a docket with a signature line. */
export function IconContract(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </Svg>
  )
}

/** Ship: a freighter under thrust. */
export function IconShip(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.5c2.4 2 3.6 4.9 3.6 8.1l1.4 3.1H7l1.4-3.1c0-3.2 1.2-6.1 3.6-8.1z" />
      <circle cx="12" cy="9" r="1.4" />
      <path d="M8 13.7 5.5 18l3.2-1.4M16 13.7 18.5 18l-3.2-1.4" />
      <path d="M10.4 18.5 12 21.5l1.6-3" />
    </Svg>
  )
}

/** Log: a stack of entries. */
export function IconLog(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 4h14v16H5z" />
      <path d="M8.5 9h7M8.5 13h7M8.5 17h4" />
    </Svg>
  )
}

/** Credits: a minted coin. */
export function IconCredits(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M14.6 9.6c-.5-.8-1.5-1.2-2.6-1.2-1.5 0-2.6.8-2.6 1.9 0 2.6 5.2 1.3 5.2 3.9 0 1.2-1.2 1.9-2.6 1.9-1.1 0-2.1-.4-2.6-1.2" />
    </Svg>
  )
}

/** Cargo hold: a stacked crate. */
export function IconCargo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </Svg>
  )
}

/** Day counter. */
export function IconDay(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** A market event, or anything else that wants an amber flag. */
export function IconWarning(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 22 20H2z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** A running contract. */
export function IconScroll(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.5h12v14a3 3 0 0 1-3 3H7.5" />
      <path d="M6 3.5a2 2 0 0 0-2 2V18a3 3 0 0 0 3 3" />
      <path d="M10 8.5h5M10 12h5" />
    </Svg>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.3 12.3 2.6 2.6 4.9-5.2" />
    </Svg>
  )
}

export function IconBlocked(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6.2 6.2 17.8 17.8" />
    </Svg>
  )
}

/** A known payment, or a credit that moved. */
export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  )
}

export function IconSound(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />
    </Svg>
  )
}

export function IconMuted(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="m16 9.5 4 5M20 9.5l-4 5" />
    </Svg>
  )
}

export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  )
}

/** The wordmark glyph: a world with a freighter in orbit of it. */
export function IconMark(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="13" r="6" />
      <path d="M3.4 15.5c1.6 2 4.4 3.2 7.6 3.2 3.2 0 6-1.2 7.6-3.2" opacity="0.55" />
      <ellipse cx="12" cy="12" rx="10.5" ry="4" transform="rotate(-22 12 12)" />
      <path d="m19.4 5.6 1.6.5-.2 1.7-2-.9z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** Agricultural: a sheaf of grain. */
function IconTypeAgricultural(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21V9" />
      <path d="M12 13c-2.6 0-4.2-1.6-4.2-4C10.4 9 12 10.6 12 13zM12 13c2.6 0 4.2-1.6 4.2-4C13.6 9 12 10.6 12 13z" />
      <path d="M12 9.5c-1.9 0-3.1-1.2-3.1-3 1.9 0 3.1 1.2 3.1 3zM12 9.5c1.9 0 3.1-1.2 3.1-3-1.9 0-3.1 1.2-3.1 3z" />
    </Svg>
  )
}

/** Industrial: a works with two stacks. */
function IconTypeIndustrial(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 20h18" />
      <path d="M5 20v-7l4.5 3V13l4.5 3v-7H18v11" />
      <path d="M14 6V3.5M18 6V4.5" opacity="0.6" />
    </Svg>
  )
}

/** Mining: a pick over a seam. */
function IconTypeMining(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 16.5c4-1.5 7-1.5 10 0 1.6.8 3.4 1 6.5.2" />
      <path d="M6 20.5h6" />
      <path d="M4.5 8.5 17 5.5c1.2-.3 2.4.2 3 1.3.6 1 .2 2.2-.6 2.9l-1.3 1.1" />
      <path d="m9 16.5 6.5-6" />
    </Svg>
  )
}

/** Technological: a circuit wafer. */
function IconTypeTechnological(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="7.5" y="7.5" width="9" height="9" rx="1.2" />
      <rect x="10.5" y="10.5" width="3" height="3" rx="0.5" />
      <path d="M10 7.5V4.5M14 7.5V4.5M10 19.5v-3M14 19.5v-3M7.5 10H4.5M7.5 14H4.5M19.5 10h-3M19.5 14h-3" />
    </Svg>
  )
}

/** Wealthy: a colonnade. */
function IconTypeWealthy(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M3 20h18M5 9.5V20M10 9.5V20M14 9.5V20M19 9.5V20" />
    </Svg>
  )
}

/** Frontier: a courier on the pad. */
function IconTypeFrontier(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3c2 1.8 3 4.2 3 7l1.4 3.4H7.6L9 10c0-2.8 1-5.2 3-7z" />
      <circle cx="12" cy="9.5" r="1.3" />
      <path d="m10.6 13.4.6 3.2-1.6 3.4M13.4 13.4l-.6 3.2 1.6 3.4" />
      <path d="M6 20h12" />
    </Svg>
  )
}

const TYPE_ICONS = {
  agricultural: IconTypeAgricultural,
  industrial: IconTypeIndustrial,
  mining: IconTypeMining,
  technological: IconTypeTechnological,
  wealthy: IconTypeWealthy,
  frontier: IconTypeFrontier,
} as const

/**
 * A world type, drawn rather than typed. `PLANET_TYPE_META` still carries its
 * emoji for log entries and anything else reading straight from data; anywhere
 * the type is chrome next to a name, this is the glyph that lines up with the
 * rest of the interface.
 */
export function IconPlanetType({
  type,
  ...props
}: IconProps & { type: keyof typeof TYPE_ICONS }) {
  const Glyph = TYPE_ICONS[type] ?? IconTypeFrontier
  return <Glyph {...props} />
}
