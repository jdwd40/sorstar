import { spawnSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyBuild, projectRoot } from './verify-build.mjs'

export function validateConfig(env) {
  for (const [name, expected] of Object.entries({
    DEPLOY_HOST: 'jdwd40.com', DEPLOY_PORT: '4020', DEPLOY_USER: 'jd',
  })) {
    if (env[name] !== expected) throw new Error(`${name} must match the fixed Sorstar configuration`)
  }
  // A destination override must never be silently mistaken for a supported option.
  for (const name of ['DEPLOY_PATH', 'DEPLOY_DEST', 'DEPLOY_DESTINATION', 'DEPLOY_ROOT']) {
    if (env[name] !== undefined) throw new Error(`${name} is unsupported: the remote destination is fixed`)
  }
}

function credentialPath(env, name) {
  const path = env[name]
  // Paths are also passed through rsync's SSH argument parser: accept no quoting/metacharacters.
  if (!path || !/^\/[A-Za-z0-9_./-]+$/.test(path)) throw new Error(`${name} must be a safe absolute path`)
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.size === 0 || (stat.mode & 0o777) !== 0o600) {
    throw new Error(`${name} must be a nonempty regular file with mode 600`)
  }
  return path
}

export function deploy(source = 'dist', env = process.env, run = spawnSync) {
  validateConfig(env)
  verifyBuild(source)
  const identity = credentialPath(env, 'DEPLOY_IDENTITY_FILE')
  const knownHosts = credentialPath(env, 'DEPLOY_KNOWN_HOSTS_FILE')
  const ssh = [
    'ssh', '-F', '/dev/null', '-p', '4020', '-i', identity,
    '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none', '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${knownHosts}`,
    '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'ConnectTimeout=15',
  ].join(' ')
  // Do not use -s/--protect-args: rrsync must inspect the remote arguments.
  // Remote / is exactly /var/www/jdwd40.com/html/sorstar under the forced rrsync root.
  const result = run('rsync', [
    '--recursive', '--times', '--compress', '--perms', '--chmod=D755,F644',
    '--delay-updates', '--delete-delay', '--timeout=60',
    '-e', ssh, '--', `${resolve(projectRoot, 'dist')}/`, 'jd@jdwd40.com:/',
  ], { stdio: 'inherit', timeout: 180_000 })
  if (result.error || result.status !== 0) throw new Error('Sorstar rsync failed')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: node scripts/deploy-sorstar.mjs [dist]')
    deploy(process.argv[2])
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
