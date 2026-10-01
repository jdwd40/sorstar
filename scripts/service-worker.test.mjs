import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { retireLegacyServiceWorker } from '../src/utils/legacyServiceWorker.ts'

const origin = 'https://jdwd40.com'

function cacheFixture() {
  const entries = {
    sorstar: [`${origin}/sorstar/`, `${origin}/sorstar/old.js`],
    coins: [`${origin}/coins/`],
    root: [`${origin}/`],
    mixed: [`${origin}/sorstar/`, `${origin}/study/`],
    misleading: [`${origin}/sorstar-other/`],
    foreign: ['https://other.example/sorstar/'],
    empty: [],
  }
  const deleted = []
  return {
    deleted,
    storage: {
      keys: async () => Object.keys(entries),
      open: async name => ({ keys: async () => entries[name].map(url => ({ url })) }),
      delete: async name => { deleted.push(name); return true },
    },
  }
}

test('app cleanup unregisters only exact Sorstar legacy worker and deletes only proven Sorstar caches', async () => {
  const cache = cacheFixture()
  const removed = []
  const registration = (name, scope, scripts) => ({
    scope, active: scripts[0] ? { scriptURL: scripts[0] } : null,
    waiting: scripts[1] ? { scriptURL: scripts[1] } : null, installing: null,
    unregister: async () => { removed.push(name); return true },
  })
  const workers = { getRegistrations: async () => [
    registration('old', `${origin}/sorstar/`, [`${origin}/sorstar/sw.js`]),
    registration('coins', `${origin}/coins/`, [`${origin}/coins/sw.js`]),
    registration('root', `${origin}/`, [`${origin}/sw.js`]),
    registration('future', `${origin}/sorstar/`, [`${origin}/sorstar/future.js`]),
    registration('mixed', `${origin}/sorstar/`, [`${origin}/sorstar/sw.js`, `${origin}/sorstar/future.js`]),
    registration('foreign', 'https://other.example/sorstar/', ['https://other.example/sorstar/sw.js']),
  ] }
  await retireLegacyServiceWorker(workers, cache.storage, origin)
  assert.deepEqual(removed, ['old'])
  assert.deepEqual(cache.deleted, ['sorstar'])
})

async function activate(scope = `${origin}/sorstar/`) {
  const cache = cacheFixture()
  const listeners = {}
  const navigated = []
  let unregistered = 0, skipped = 0
  const self = {
    location: { origin, pathname: '/sorstar/sw.js' },
    registration: { scope, unregister: async () => { unregistered++ } },
    addEventListener: (name, handler) => { listeners[name] = handler },
    skipWaiting: async () => { skipped++ },
    clients: { matchAll: async () => ['/sorstar/', '/sorstar/game', '/coins/', '/', '/sorstar-other/'].map(path => ({
      url: origin + path, navigate: async url => { navigated.push(url) },
    })) },
  }
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, caches: cache.storage, URL })
  await new Promise((resolve, reject) => listeners.install({ waitUntil: work => work.then(resolve, reject) }))
  await new Promise((resolve, reject) => listeners.activate({ waitUntil: work => work.then(resolve, reject) }))
  return { deleted: cache.deleted, navigated, unregistered, skipped }
}

test('retirement worker updates cached old pages while preserving other app caches and windows', async () => {
  const result = await activate()
  assert.equal(result.skipped, 1)
  assert.equal(result.unregistered, 1)
  assert.deepEqual(result.deleted, ['sorstar'])
  assert.deepEqual(result.navigated, [`${origin}/sorstar/`, `${origin}/sorstar/game`])
})

test('retirement worker at an unrelated scope cannot unregister or delete caches', async () => {
  const result = await activate(`${origin}/coins/`)
  assert.equal(result.unregistered, 0)
  assert.deepEqual(result.deleted, [])
  assert.deepEqual(result.navigated, [])
})
