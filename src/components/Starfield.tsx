import { useMemo } from 'react'

interface Star {
  x: number
  y: number
  size: number
  delay: number
  duration: number
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeStars(count: number, seed: number, min: number, max: number): Star[] {
  const rand = mulberry32(seed)
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * 100,
      y: rand() * 100,
      size: min + rand() * (max - min),
      delay: rand() * 6,
      duration: 3 + rand() * 7,
    })
  }
  return stars
}

export default function Starfield() {
  const layers = useMemo(
    () => [
      { stars: makeStars(70, 11, 1, 1.6), drift: 90, opacity: 0.5 },
      { stars: makeStars(50, 22, 1.2, 2.1), drift: 60, opacity: 0.7 },
      { stars: makeStars(26, 33, 1.8, 3), drift: 40, opacity: 0.9 },
    ],
    [],
  )

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 bg-[#0b0f1a]" />
      <div
        className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 rounded-full blur-3xl opacity-25"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.55), transparent 70%)' }}
      />
      <div
        className="absolute -bottom-1/3 -right-1/4 w-2/3 h-2/3 rounded-full blur-3xl opacity-20"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.5), transparent 70%)' }}
      />
      <div
        className="absolute top-1/4 -right-1/4 w-1/2 h-1/2 rounded-full blur-3xl opacity-15"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.5), transparent 70%)' }}
      />
      {layers.map((layer, li) => (
        <div
          key={li}
          className="absolute inset-0"
          style={{ animation: `drift ${layer.drift}s linear infinite alternate`, opacity: layer.opacity }}
        >
          {layer.stars.map((star, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: star.size,
                height: star.size,
                boxShadow: star.size > 2 ? '0 0 6px rgba(255,255,255,0.8)' : undefined,
                animation: `twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}