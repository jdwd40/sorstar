import type { Planet, PlanetType } from '../../types/game'

/**
 * How each world looks: three surface tones, an atmospheric rim, a surface
 * texture and an optional ring system.
 *
 * Presentation only, and keyed by planet id rather than by type - two mining
 * worlds (Korbant's rust canyons, Ironreach's dark rock) and two agricultural
 * ones (Eden's green, Telos' turquoise) have nothing in common to share, and a
 * palette derived from `PlanetType` would flatten them into the same dot. The
 * type map is a fallback for a planet id this build does not know.
 *
 * Everything is a 6-digit hex so a surface colour can be reused at a chosen
 * alpha (`#rrggbb` + `33`) in a gradient stack without a colour library.
 */
export type PlanetTexture =
  | 'cloud'
  | 'swirl'
  | 'crater'
  | 'dust'
  | 'grid'
  | 'city'
  | 'bands'
  | 'pipes'
  | 'rock'

export interface PlanetStyle {
  /** Surface colour at the lit pole. */
  core: string
  /** Surface colour at the terminator. */
  shade: string
  /** Colour of the night side. */
  night: string
  /** Atmospheric rim and halo. */
  rim: string
  /** Surface features, drawn on top of the sphere. */
  texture: PlanetTexture
  /** Feature colour. */
  detail: string
  /** Ring system colour, or none. */
  ring?: string
  /** Ring tilt in degrees. */
  ringTilt?: number
}

const STYLES: Record<string, PlanetStyle> = {
  eden: {
    core: '#4aa96b',
    shade: '#1c6b4c',
    night: '#0a2b3c',
    rim: '#6ee7b7',
    texture: 'cloud',
    detail: '#d9fbe8',
  },
  korbant: {
    core: '#bb6529',
    shade: '#7a3a17',
    night: '#2a1410',
    rim: '#fb923c',
    texture: 'crater',
    detail: '#fdba74',
  },
  nextera: {
    core: '#2b8fd6',
    shade: '#155a97',
    night: '#071733',
    rim: '#67e8f9',
    texture: 'grid',
    detail: '#a5f3fc',
  },
  aurelia: {
    core: '#d0a53f',
    shade: '#7c4fa8',
    night: '#2b1836',
    rim: '#d8b4fe',
    texture: 'bands',
    detail: '#fde68a',
    ring: '#fcd34d',
    ringTilt: -18,
  },
  vorgon: {
    core: '#6b7280',
    shade: '#3d444d',
    night: '#131920',
    rim: '#fb923c',
    texture: 'pipes',
    detail: '#fb923c',
    ring: '#94a3b8',
    ringTilt: 14,
  },
  drax: {
    core: '#b8503a',
    shade: '#6f2a1e',
    night: '#2a1210',
    rim: '#f87171',
    texture: 'dust',
    detail: '#fca5a5',
  },
  ironreach: {
    core: '#6b5c48',
    shade: '#3a3229',
    night: '#15120e',
    rim: '#fbbf24',
    texture: 'rock',
    detail: '#fbbf24',
    ring: '#f59e0b',
    ringTilt: -10,
  },
  straton: {
    core: '#5a63dd',
    shade: '#33318f',
    night: '#101339',
    rim: '#a5b4fc',
    texture: 'city',
    detail: '#e0e7ff',
  },
  telos: {
    core: '#2fb8a6',
    shade: '#17786f',
    night: '#06232a',
    rim: '#5eead4',
    texture: 'swirl',
    detail: '#a7f3d0',
  },
}

const BY_TYPE: Record<PlanetType, PlanetStyle> = {
  agricultural: STYLES.eden,
  mining: STYLES.korbant,
  technological: STYLES.nextera,
  wealthy: STYLES.aurelia,
  industrial: STYLES.vorgon,
  frontier: STYLES.drax,
}

/** The look of a planet, falling back to its type for an unknown world. */
export function planetStyle(planet: Planet | undefined): PlanetStyle {
  if (!planet) return STYLES.eden
  return STYLES[planet.id] ?? BY_TYPE[planet.type] ?? STYLES.eden
}

/**
 * The surface features for a sphere, as CSS gradient layers.
 *
 * Layers paint first-listed on top, so these sit over the terminator gradient
 * and read as cloud, crust or city light rather than as a wash. Deliberately
 * cheap: gradients and gradients, no filters, no extra elements, and every one
 * of them is a single paint on the planet's own box.
 */
export function textureLayers(style: PlanetStyle): string[] {
  const d = style.detail
  const s = style.shade
  switch (style.texture) {
    case 'cloud':
      return [
        `radial-gradient(ellipse 60% 26% at 30% 28%, ${d}59 0%, ${d}00 72%)`,
        `radial-gradient(ellipse 46% 20% at 70% 48%, ${d}40 0%, ${d}00 74%)`,
        `radial-gradient(ellipse 34% 15% at 44% 70%, ${d}2e 0%, ${d}00 72%)`,
      ]
    case 'swirl':
      return [
        `radial-gradient(ellipse 70% 18% at 24% 34%, ${d}4d 0%, ${d}00 78%)`,
        `radial-gradient(ellipse 56% 14% at 62% 56%, ${d}40 0%, ${d}00 80%)`,
        `radial-gradient(ellipse 40% 12% at 38% 76%, ${d}33 0%, ${d}00 78%)`,
      ]
    case 'crater':
      return [
        `radial-gradient(circle 9px at 36% 34%, ${s}cc 0 55%, ${d}33 70%, transparent 78%)`,
        `radial-gradient(circle 6px at 60% 52%, ${s}cc 0 55%, ${d}2e 70%, transparent 78%)`,
        `radial-gradient(circle 4px at 26% 62%, ${s}cc 0 55%, ${d}2e 70%, transparent 78%)`,
        `radial-gradient(circle 5px at 50% 76%, ${s}b3 0 55%, ${d}26 70%, transparent 78%)`,
      ]
    case 'dust':
      return [
        `linear-gradient(112deg, ${d}00 34%, ${d}3d 44%, ${d}00 56%)`,
        `linear-gradient(112deg, ${d}00 58%, ${d}2e 66%, ${d}00 76%)`,
        `linear-gradient(112deg, ${d}00 8%, ${d}24 16%, ${d}00 24%)`,
      ]
    case 'grid':
      return [
        `repeating-linear-gradient(90deg, ${d}1f 0 1px, transparent 1px 16%)`,
        `repeating-linear-gradient(0deg, ${d}1f 0 1px, transparent 1px 16%)`,
        `radial-gradient(ellipse 30% 30% at 50% 50%, ${d}26 0%, transparent 75%)`,
      ]
    case 'city':
      return [
        `radial-gradient(circle 1.2px at 38% 62%, ${d} 0 60%, transparent 100%)`,
        `radial-gradient(circle 1px at 47% 55%, ${d}b3 0 60%, transparent 100%)`,
        `radial-gradient(circle 1.4px at 57% 68%, ${d} 0 60%, transparent 100%)`,
        `radial-gradient(circle 1px at 30% 44%, ${d}8c 0 60%, transparent 100%)`,
        `radial-gradient(circle 1.1px at 63% 47%, ${d}cc 0 60%, transparent 100%)`,
        `radial-gradient(circle 1px at 41% 76%, ${d}99 0 60%, transparent 100%)`,
      ]
    case 'bands':
      return [
        `repeating-linear-gradient(6deg, ${d}2b 0 5%, transparent 5% 11%)`,
        `repeating-linear-gradient(6deg, ${d}14 2% 8%, transparent 8% 15%)`,
      ]
    case 'pipes':
      return [
        `repeating-linear-gradient(90deg, ${d}1c 0 1px, transparent 1px 11%)`,
        `repeating-linear-gradient(0deg, ${d}14 0 1px, transparent 1px 13%)`,
        `radial-gradient(ellipse 40% 26% at 70% 74%, ${s}cc 0%, transparent 76%)`,
        `radial-gradient(ellipse 34% 22% at 26% 30%, ${s}99 0%, transparent 78%)`,
      ]
    case 'rock':
      return [
        `radial-gradient(ellipse 46% 30% at 32% 32%, ${s}cc 0 62%, transparent 76%)`,
        `radial-gradient(ellipse 40% 26% at 66% 58%, ${s}b3 0 62%, transparent 76%)`,
        `radial-gradient(ellipse 30% 20% at 44% 76%, ${s}99 0 62%, transparent 78%)`,
        `radial-gradient(circle 5px at 56% 30%, ${d}40 0 60%, transparent 80%)`,
      ]
  }
}
