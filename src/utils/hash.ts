/**
 * FNV-1a over a string, as an unsigned 32-bit integer.
 *
 * The single hash the game's deterministic systems share. Market drift, market
 * events and every other seeded draw derive from it, so the same inputs always
 * produce the same number - which is what makes a saved game replay to the same
 * market rather than a fresh one.
 */
export function hashString(str: string): number {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}