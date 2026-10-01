import assert from 'node:assert/strict'
import { test } from 'node:test'
import { neighbours, readPublic, snapshotNeighbours, verifyLive } from './verify-live.mjs'

function fixture() {
  const files = new Map([
    ['index.html', Buffer.from('<title>Sorstar</title><div id="root"></div>')],
    ['assets/index-12345678.js', Buffer.from('console.log("built asset")')],
    ['assets/index-12345678.css', Buffer.from('body{color:white}')],
    ['favicon.svg', Buffer.from('<svg/>')], ['sw.js', Buffer.from('retirement worker')],
  ])
  const pages = new Map(neighbours.map(path => [path, { body: `<title>Neighbour ${path}</title>`, type: 'text/html' }]))
  for (const path of ['/sorstar', '/sorstar/', '/sorstar/game', '/sorstar/game/']) {
    pages.set(path, { body: files.get('index.html'), type: 'text/html' })
  }
  for (const [file, bytes] of files) pages.set(`/sorstar/${file}`, { body: bytes, type: file.endsWith('.html') ? 'text/html' : 'application/octet-stream' })
  const fetcher = async url => {
    const page = pages.get(new URL(url).pathname)
    return {
      status: page?.status ?? 200, url: page?.url ?? url,
      headers: new Headers({ 'content-type': page?.type ?? 'text/html' }),
      arrayBuffer: async () => Buffer.from(page?.body ?? files.get('index.html')),
    }
  }
  return { files, pages, fetcher }
}

test('live verification accepts matching entrypoint/routes/assets and neighbour checksums', async () => {
  const f = fixture()
  await verifyLive(await snapshotNeighbours(f.fetcher), f.files, f.fetcher)
})

test('status 200 SPA fallback for a missing asset fails live verification', async () => {
  const f = fixture()
  const snapshot = await snapshotNeighbours(f.fetcher)
  f.pages.delete('/sorstar/assets/index-12345678.js')
  await assert.rejects(verifyLive(snapshot, f.files, f.fetcher), /asset differs/)
})

test('neighbour returning portfolio fallback HTML cannot become a passing baseline', async () => {
  const f = fixture()
  f.pages.set('/coins/', { ...f.pages.get('/') })
  await assert.rejects(snapshotNeighbours(f.fetcher), /possible fallback/)
})

test('wrong entrypoint, wrong asset bytes and changed neighbour markers fail', async () => {
  for (const path of ['/sorstar', '/sorstar/', '/sorstar/game', '/sorstar/game/', '/sorstar/assets/index-12345678.js', ...neighbours]) {
    const f = fixture()
    const snapshot = await snapshotNeighbours(f.fetcher)
    f.pages.get(path).body = '<title>Changed</title>changed content'
    await assert.rejects(verifyLive(snapshot, f.files, f.fetcher))
  }
})

test('non-200, cross-origin redirect and unrelated same-origin redirect fail', async () => {
  for (const change of [{ status: 404 }, { url: 'https://evil.example/sorstar/' }, { url: 'https://jdwd40.com/' }]) {
    const f = fixture()
    Object.assign(f.pages.get('/sorstar/'), change)
    await assert.rejects(readPublic('/sorstar/', f.fetcher), /Unexpected/)
  }
})
