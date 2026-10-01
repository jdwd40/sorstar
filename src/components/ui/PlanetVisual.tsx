import type { Planet } from '../../types/game'
import { planetStyle, textureLayers } from './planetStyle'

/**
 * One reusable planet graphic, drawn entirely in CSS.
 *
 * Sorstar's worlds used to be a dot on the map and an emoji everywhere else,
 * which made "where am I", "how far is that" and "which of these is a mining
 * world" all the same question of squinting at text. This is the answer to all
 * three: a lit sphere with its own palette, an atmosphere, and rings where a
 * world has them.
 *
 * The sphere is one element with a stack of radial gradients - a terminator, a
 * pole highlight, and the surface texture from `planetStyle` - inside a
 * `overflow: hidden` circle. No canvas, no WebGL, no images and no filters: it
 * composites as a handful of ordinary gradients, so nine of them on the sector
 * chart cost about as much as nine text nodes.
 *
 * Sizes are the diameter in CSS pixels; `sm` is a map dot, `lg` is a HUD world
 * and `xl` and up are the arrival report's.
 */
const SIZE_PX = {
  xs: 14,
  sm: 22,
  md: 40,
  lg: 68,
  xl: 112,
  '2xl': 176,
} as const

export type PlanetSize = keyof typeof SIZE_PX

interface PlanetVisualProps {
  planet: Planet | undefined
  size?: PlanetSize
  /**
   * Draws a marker around the world. `current` is the ship: a slow pulsing
   * ring, always on, readable at a glance while scrolling the chart.
   */
  highlight?: 'current' | 'selected' | null
  /**
   * An accessible name. Omit for decoration - a planet next to its own name on
   * screen is read twice if it also announces itself.
   */
  label?: string
  className?: string
}

export default function PlanetVisual({
  planet,
  size = 'md',
  highlight = null,
  label,
  className = '',
}: PlanetVisualProps) {
  const px = SIZE_PX[size]
  const style = planetStyle(planet)
  const { core, shade, night, rim, detail } = style

  // Below this the ring is a single pixel of mud around a small dot, so the
  // smallest two sizes drop it and keep the sphere.
  const ring = px >= 26 ? style.ring : undefined
  const ringWidth = Math.max(1, Math.round(px / 26))
  const ringBox = {
    left: '-44%',
    right: '-44%',
    top: '-20%',
    bottom: '-20%',
    borderStyle: 'solid' as const,
    borderWidth: ringWidth,
    borderColor: ring,
    borderRadius: '50%',
    transform: `scaleY(0.3) rotate(${style.ringTilt ?? 0}deg)`,
  }

  return (
    <span
      data-planet={planet?.id ?? 'none'}
      data-planet-size={size}
      className={`relative inline-block shrink-0 align-middle ${className}`}
      style={{ width: px, height: px, lineHeight: 0 }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Atmosphere: a soft falloff just outside the limb, no blur filter. */}
      <span
        className="absolute rounded-full"
        style={{
          inset: -Math.round(px * 0.16),
          background: `radial-gradient(circle, ${rim}00 52%, ${rim}59 66%, ${rim}00 78%)`,
        }}
      />

      {ring && <span className="absolute" style={{ ...ringBox, opacity: 0.45 }} />}

      <span
        className="absolute inset-0 rounded-full"
        style={{
          backgroundImage: [
            ...textureLayers(style),
            `radial-gradient(circle at 32% 27%, ${core} 0%, ${shade} 38%, ${night} 80%, ${night} 100%)`,
          ].join(', '),
          boxShadow: `0 0 ${Math.max(4, Math.round(px * 0.16))}px ${rim}4d, inset -2px -3px 6px rgba(0,0,0,0.5)`,
        }}
      >
        {/* Terminator and limb light, over the texture. */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle at 30% 24%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 38%), radial-gradient(circle at 62% 70%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 62%)',
            boxShadow: `inset 0 0 ${Math.max(2, Math.round(px * 0.06))}px ${rim}80`,
          }}
        />
      </span>

      {ring && (
        // The near half of the ring, clipped in front of the sphere.
        <span
          className="absolute"
          style={{ ...ringBox, opacity: 0.75, clipPath: 'inset(50% 0% 0% 0%)' }}
        />
      )}

      {highlight === 'current' && (
        <>
          <span
            className="absolute rounded-full pulse-glow"
            style={{
              inset: -Math.round(px * 0.3),
              border: `1.5px solid ${detail}cc`,
            }}
          />
          <span
            className="absolute rounded-full"
            style={{
              inset: -Math.round(px * 0.14),
              border: `1px solid #ffffff66`,
            }}
          />
        </>
      )}

      {highlight === 'selected' && (
        <span
          className="absolute rounded-full"
          style={{
            inset: -Math.round(px * 0.16),
            border: `1.5px solid ${rim}`,
            boxShadow: `0 0 ${Math.round(px * 0.3)}px ${rim}66`,
          }}
        />
      )}
    </span>
  )
}
