import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { projectRoot } from './verify-build.mjs'

function fixture(t) {
  const temporary = join(projectRoot, 'node_modules', '.tmp')
  mkdirSync(temporary, { recursive: true })
  const root = mkdtempSync(join(temporary, 'sorstar-deploy-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const dir of ['scripts', 'dist/assets', 'bin']) mkdirSync(join(root, dir), { recursive: true })
  for (const file of ['deploy-sorstar.mjs', 'verify-build.mjs']) {
    copyFileSync(join(projectRoot, 'scripts', file), join(root, 'scripts', file))
  }
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  const html = '<div id="root"></div><script type="module" src="/sorstar/assets/index-12345678.js"></script><link href="/sorstar/assets/index-12345678.css">'
  writeFileSync(join(root, 'dist/index.html'), html)
  for (const file of ['assets/index-12345678.js', 'assets/index-12345678.css', 'favicon.svg', 'sw.js']) {
    writeFileSync(join(root, 'dist', file), 'nonempty fixture')
  }
  // Inert placeholders, never real keys. The only executable transport is mocked.
  for (const file of ['identity', 'known_hosts']) writeFileSync(join(root, file), 'test placeholder', { mode: 0o600 })
  const marker = join(root, 'rsync-invoked.json')
  writeFileSync(join(root, 'bin/rsync'), `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs'\nwriteFileSync(process.env.MOCK_RSYNC_MARKER, JSON.stringify(process.argv.slice(2)))\n`, { mode: 0o755 })
  const env = {
    ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`,
    DEPLOY_HOST: 'jdwd40.com', DEPLOY_PORT: '4020', DEPLOY_USER: 'jd',
    DEPLOY_IDENTITY_FILE: join(root, 'identity'), DEPLOY_KNOWN_HOSTS_FILE: join(root, 'known_hosts'),
    MOCK_RSYNC_MARKER: marker,
  }
  for (const name of ['DEPLOY_PATH', 'DEPLOY_ROOT', 'DEPLOY_DEST', 'DEPLOY_DESTINATION']) delete env[name]
  function run(source = 'dist', overrides = {}) {
    rmSync(marker, { force: true })
    return spawnSync(process.execPath, [join(root, 'scripts/deploy-sorstar.mjs'), source], {
      cwd: root, env: { ...env, ...overrides }, encoding: 'utf8',
    })
  }
  function refused(source, overrides) {
    const result = run(source, overrides)
    assert.notEqual(result.status, 0, result.stdout)
    assert.equal(existsSync(marker), false, 'Unsafe configuration must never invoke rsync')
  }
  return { root, marker, run, refused, html }
}

test('exact valid configuration invokes mocked rsync with fixed root, safe SSH and delayed deletion', t => {
  const f = fixture(t)
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  const args = JSON.parse(readFileSync(f.marker))
  assert.deepEqual(args.slice(-3), ['--', `${f.root}/dist/`, 'jd@jdwd40.com:/'])
  for (const option of ['--delay-updates', '--delete-delay', '--recursive', '--chmod=D755,F644']) assert.ok(args.includes(option))
  assert.ok(!args.includes('--delete') && !args.includes('--protect-args'))
  const ssh = args[args.indexOf('-e') + 1]
  for (const option of ['-F /dev/null', '-p 4020', 'BatchMode=yes', 'IdentitiesOnly=yes', 'IdentityAgent=none', 'StrictHostKeyChecking=yes', 'GlobalKnownHostsFile=/dev/null']) assert.ok(ssh.includes(option))
})

test('missing, empty, incorrect and malicious host/user/port values fail before rsync', t => {
  const f = fixture(t)
  const invalid = {
    DEPLOY_HOST: [undefined, '', 'jdwd40.com ', 'evil.example', '-oProxyCommand=touch /tmp/pwned', 'jdwd40.com;false', 'jdwd40.com\n'],
    DEPLOY_USER: [undefined, '', 'root', 'jd ', 'jd@evil.example', 'jd;false'],
    DEPLOY_PORT: [undefined, '', '22', '04020', '4020 ', '4020 -oStrictHostKeyChecking=no'],
  }
  for (const [name, values] of Object.entries(invalid)) {
    for (const value of values) f.refused('dist', { [name]: value })
  }
  for (const name of ['DEPLOY_PATH', 'DEPLOY_ROOT', 'DEPLOY_DEST', 'DEPLOY_DESTINATION']) {
    for (const value of ['', '/', '/var/www/jdwd40.com/html', '../']) f.refused('dist', { [name]: value })
  }
})

test('source overrides, traversal, absent/empty entrypoint and wrong asset prefixes fail before rsync', t => {
  const f = fixture(t)
  for (const source of ['', '/', '.', '..', './dist', 'dist/', 'dist/../dist', '/tmp', 'dist;false', 'jd@evil:/']) f.refused(source)
  for (const html of ['', '<h1>Not a build</h1>', f.html.replaceAll('/sorstar/assets/', '/assets/'), f.html.replace('12345678.js', 'missing12.js')]) {
    writeFileSync(join(f.root, 'dist/index.html'), html)
    f.refused('dist')
  }
  rmSync(join(f.root, 'dist/index.html'))
  f.refused('dist')
})

test('symlinks in the source directory or its files never reach rsync', t => {
  const f = fixture(t)
  symlinkSync(join(f.root, 'identity'), join(f.root, 'dist/leak'))
  f.refused('dist')
  rmSync(join(f.root, 'dist/leak'))
  rmSync(join(f.root, 'dist'), { recursive: true })
  mkdirSync(join(f.root, 'other'))
  symlinkSync(join(f.root, 'other'), join(f.root, 'dist'))
  f.refused('dist')
})

test('unsafe, missing, empty, symlinked or permissive credential files never reach rsync', t => {
  const f = fixture(t)
  for (const name of ['DEPLOY_IDENTITY_FILE', 'DEPLOY_KNOWN_HOSTS_FILE']) {
    for (const value of [undefined, '', 'relative', '/tmp/absent-sorstar-file', '/tmp/key;false', '/tmp/key with spaces', '/tmp/key\n']) f.refused('dist', { [name]: value })
  }
  chmodSync(join(f.root, 'identity'), 0o644)
  f.refused('dist')
  chmodSync(join(f.root, 'identity'), 0o600)
  writeFileSync(join(f.root, 'known_hosts'), '')
  f.refused('dist')
  rmSync(join(f.root, 'known_hosts'))
  symlinkSync(join(f.root, 'identity'), join(f.root, 'known_hosts'))
  f.refused('dist')
})
