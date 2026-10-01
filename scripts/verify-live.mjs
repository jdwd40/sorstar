import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256, verifyBuild } from './verify-build.mjs'

const origin = 'https://jdwd40.com'
export const neighbours = ['/', '/coins/', '/study/', '/dc/']

export async function readPublic(path, fetcher = fetch) {
  const response = await fetcher(`${origin}${path}`, {
    cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20_000),
  })
  const final = new URL(response.url)
  if (response.status !== 200 || final.origin !== origin ||
      (final.pathname !== path && final.pathname !== `${path}/`)) {
    throw new Error(`Unexpected status or redirect for ${path}`)
  }
  return { bytes: Buffer.from(await response.arrayBuffer()), type: response.headers.get('content-type') ?? '' }
}

export async function snapshotNeighbours(fetcher = fetch) {
  const snapshot = {}
  const seen = new Set()
  for (const path of neighbours) {
    const { bytes, type } = await readPublic(path, fetcher)
    const title = bytes.toString().match(/<title\b[^>]*>([^<]+)<\/title>/i)?.[1]
    if (!type.includes('text/html') || !title?.trim()) throw new Error(`Missing neighbour HTML/title at ${path}`)
    const checksum = sha256(bytes)
    if (seen.has(checksum)) throw new Error(`Duplicate neighbour HTML at ${path}: possible fallback`)
    seen.add(checksum)
    snapshot[path] = { title, sha256: checksum }
  }
  return snapshot
}

export async function verifyLive(snapshot, files = verifyBuild(), fetcher = fetch) {
  // Include the actual /game route: Nginx must serve the built entrypoint on refresh.
  for (const path of ['/sorstar', '/sorstar/', '/sorstar/game', '/sorstar/game/']) {
    const { bytes, type } = await readPublic(path, fetcher)
    if (!type.includes('text/html') || sha256(bytes) !== sha256(files.get('index.html'))) {
      throw new Error(`Deployed entrypoint differs from build at ${path}`)
    }
  }
  for (const [file, expected] of files) {
    if (file === 'index.html') continue
    const { bytes, type } = await readPublic(`/sorstar/${file}`, fetcher)
    if (type.includes('text/html') || sha256(bytes) !== sha256(expected)) {
      throw new Error(`Deployed asset differs from build (or SPA fallback returned) at ${file}`)
    }
  }
  const current = await snapshotNeighbours(fetcher)
  for (const path of neighbours) {
    if (!snapshot[path]?.title || !snapshot[path]?.sha256 ||
        current[path].title !== snapshot[path].title || current[path].sha256 !== snapshot[path].sha256) {
      throw new Error(`Neighbour marker/content changed at ${path}`)
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, path] = process.argv.slice(2)
    if (process.argv.length !== 4 || !path || !['snapshot', 'verify'].includes(mode)) {
      throw new Error('Usage: node scripts/verify-live.mjs snapshot|verify SNAPSHOT_FILE')
    }
    if (mode === 'snapshot') {
      writeFileSync(path, JSON.stringify(await snapshotNeighbours()), { mode: 0o600 })
      console.log('Captured portfolio, coins, study, and dc markers/checksums')
    } else {
      await verifyLive(JSON.parse(readFileSync(path, 'utf8')))
      console.log('Live entrypoints, build file checksums, and neighbour markers verified')
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
