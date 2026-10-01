import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function verifyBuild(source = 'dist', root = projectRoot) {
  const directory = join(root, 'dist')
  if (source !== 'dist' && source !== directory) throw new Error('Source must be exactly this checkout\'s dist directory')
  if (realpathSync(root) !== root || !lstatSync(directory).isDirectory() || realpathSync(directory) !== directory) {
    throw new Error('Build directory must be ordinary and must not traverse symlinks')
  }
  const files = new Map()
  function walk(relative = '') {
    for (const name of readdirSync(join(directory, relative))) {
      const path = join(relative, name)
      if (!/^[A-Za-z0-9_./-]+$/.test(path)) throw new Error('Unsafe build filename')
      const stat = lstatSync(join(directory, path))
      if (stat.isDirectory()) walk(path)
      else if (stat.isFile() && stat.size > 0) files.set(path, readFileSync(join(directory, path)))
      else throw new Error('Build contains a symlink, empty file, or non-regular file')
    }
  }
  walk()
  const html = files.get('index.html')?.toString()
  if (!html || !html.includes('<div id="root"></div>')) throw new Error('Missing/nonempty SPA entrypoint required')
  const references = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1])
  if (!references.some(path => /^\/sorstar\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.js$/.test(path))) {
    throw new Error('Missing hashed JavaScript under /sorstar/assets/')
  }
  for (const path of references) {
    if (!path.startsWith('/sorstar/') || !files.has(path.slice('/sorstar/'.length))) {
      throw new Error('Entrypoint references an asset outside /sorstar/ or a missing file')
    }
  }
  for (const required of ['favicon.svg', 'sw.js']) {
    if (!files.has(required)) throw new Error(`Missing ${required}`)
  }
  return files
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: node scripts/verify-build.mjs [dist]')
    console.log(`Verified ${verifyBuild(process.argv[2]).size} nonempty build files and /sorstar/ asset paths`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
