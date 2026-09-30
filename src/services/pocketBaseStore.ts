import PocketBase from 'pocketbase'
import type { GameState } from '../types/game'
import { SAVE_KEY } from '../data/gameData'
import { migrate } from './migrate'
import type { AuthStore, AuthUser, GameStore, SessionLostReason } from './gameStore'

const USERS_COLLECTION = 'users'
const SAVES_COLLECTION = 'saves'

/** Marks a PocketBase account as chosen by this browser (as opposed to the throwaway anonymous pilot). */
const ACCOUNT_FLAG_KEY = 'sorstar.pb.account'

/**
 * Credentials of this browser's throwaway anonymous pilot, kept in localStorage
 * so an expired session can re-adopt the *same* pilot (and its save) instead of
 * minting a new identity and orphaning the old one. Only generated pilot
 * credentials are stored here - never a registered account's password.
 */
const PILOT_KEY = 'sorstar.pb.pilot'

interface AccountFlag {
  email: string
  name: string
}

interface PilotCredentials {
  email: string
  password: string
}

function readAccountFlag(): AccountFlag | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_FLAG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AccountFlag
    if (!parsed || typeof parsed.email !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function writeAccountFlag(flag: AccountFlag): void {
  try {
    window.localStorage.setItem(ACCOUNT_FLAG_KEY, JSON.stringify(flag))
  } catch {
    // noop
  }
}

function clearAccountFlag(): void {
  try {
    window.localStorage.removeItem(ACCOUNT_FLAG_KEY)
  } catch {
    // noop
  }
}

function readPilotCredentials(): PilotCredentials | null {
  try {
    const raw = window.localStorage.getItem(PILOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PilotCredentials>
    if (!parsed || typeof parsed.email !== 'string' || typeof parsed.password !== 'string') {
      return null
    }
    if (!parsed.email || !parsed.password) return null
    return { email: parsed.email, password: parsed.password }
  } catch {
    return null
  }
}

function writePilotCredentials(creds: PilotCredentials): void {
  try {
    window.localStorage.setItem(PILOT_KEY, JSON.stringify(creds))
  } catch {
    // noop
  }
}

function clearPilotCredentials(): void {
  try {
    window.localStorage.removeItem(PILOT_KEY)
  } catch {
    // noop
  }
}

function randomString(length: number, alphabet: string): string {
  // Rejection sampling avoids the modulo bias of `byte % alphabet.length`.
  const acceptable = Math.floor(256 / alphabet.length) * alphabet.length
  let out = ''
  while (out.length < length) {
    const bytes = new Uint8Array(Math.min(256, length - out.length + 16))
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (byte < acceptable) {
        out += alphabet[byte % alphabet.length]
        if (out.length >= length) break
      }
    }
  }
  return out
}

const EMAIL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const PASSWORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'

function errorStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: unknown }).status
    if (typeof status === 'number') return status
  }
  return null
}

/**
 * The server rejected our identity/credentials (the identity is gone), as
 * opposed to a transient network/server failure (where it must be kept).
 */
function isAuthRejection(err: unknown): boolean {
  const status = errorStatus(err)
  return status === 401 || status === 403
}

/** PocketBase throws 404 from getFirstListItem when nothing matches. */
function isNotFound(err: unknown): boolean {
  return errorStatus(err) === 404
}

function describeError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const data = (err as { data?: { message?: unknown } }).data
    const message =
      typeof data?.message === 'string'
        ? data.message
        : (err as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

/**
 * Account layer for a PocketBase-backed store. Signing up / signing in binds
 * saves to a real account instead of a throwaway anonymous pilot.
 */
class PocketBaseAuthStore implements AuthStore {
  constructor(
    private readonly pb: PocketBase,
    private readonly ensureSession: () => Promise<void>,
    private readonly resetSession: () => void,
  ) {}

  get user(): AuthUser | null {
    const flag = readAccountFlag()
    if (!flag) return null
    const model = this.pb.authStore.model
    if (!model) return null
    return {
      id: model.id as string,
      email: (model.email as string) ?? flag.email,
      name: (model.name as string) ?? flag.name,
    }
  }

  async register(email: string, password: string, name?: string): Promise<string | null> {
    const sessionError = await this.startSession()
    if (sessionError) return sessionError
    let previous: Record<string, unknown> | null
    try {
      previous = await this.captureCurrentSave()
    } catch (err) {
      return describeError(err, 'Could not read your current save. Please try again.')
    }
    try {
      await this.pb.collection(USERS_COLLECTION).create({
        email,
        password,
        passwordConfirm: password,
        name: name?.trim() || 'Pilot',
      })
    } catch (err) {
      return describeError(err, 'Registration failed.')
    }
    try {
      await this.pb.collection(USERS_COLLECTION).authWithPassword(email, password)
    } catch (err) {
      return describeError(err, 'Account created, but sign-in failed.')
    }
    const flag = { email, name: name?.trim() || 'Pilot' }
    writeAccountFlag(flag)
    // The account is now the identity of record, so the anonymous pilot it was
    // created from must not be able to reclaim the session later. Its save has
    // either been adopted below or was already superseded by the account's own.
    clearPilotCredentials()
    await this.adoptSave(previous)
    return null
  }

  async login(email: string, password: string): Promise<string | null> {
    const sessionError = await this.startSession()
    if (sessionError) return sessionError
    let previous: Record<string, unknown> | null
    try {
      previous = await this.captureCurrentSave()
    } catch (err) {
      return describeError(err, 'Could not read your current save. Please try again.')
    }
    try {
      await this.pb.collection(USERS_COLLECTION).authWithPassword(email, password)
    } catch (err) {
      return describeError(err, 'Sign-in failed.')
    }
    const model = this.pb.authStore.model
    writeAccountFlag({
      email: (model?.email as string) ?? email,
      name: (model?.name as string) ?? '',
    })
    // See register(): the account supersedes the anonymous pilot, so retire the
    // pilot credentials rather than leave a second identity that could be
    // resumed in its place.
    clearPilotCredentials()
    await this.adoptSave(previous)
    return null
  }

  async logout(): Promise<void> {
    this.pb.authStore.clear()
    clearAccountFlag()
    // Sign-out returns the store to a *fresh* anonymous pilot, so the old
    // pilot's credentials must not resurrect it on the next session init.
    clearPilotCredentials()
    this.resetSession()
  }

  /**
   * Settles the current (pre-switch) identity so capture/adopt work against a
   * real user id, even if auth operations happen before the first save/load.
   */
  private async startSession(): Promise<string | null> {
    try {
      await this.ensureSession()
      return null
    } catch (err) {
      return describeError(err, 'Cannot reach the save server right now.')
    }
  }

  /** Reads the save belonging to the current (pre-switch) identity. */
  private async captureCurrentSave(): Promise<Record<string, unknown> | null> {
    const currentId = this.pb.authStore.model?.id as string | undefined
    if (!currentId) return null
    try {
      return await this.pb
        .collection(SAVES_COLLECTION)
        .getFirstListItem(this.pb.filter('user = {:id}', { id: currentId }))
    } catch (err) {
      // 404 = no save yet - nothing to adopt. Anything else would silently
      // skip adoption and could lose the browser's save, so surface it.
      if (isNotFound(err)) return null
      throw err
    }
  }

  /**
   * Adopts the browser's previous save into the freshly signed-in account, if
   * that account doesn't have its own save yet. The old record is left in place
   * (its list/delete rules only allow the previous owner to touch it).
   */
  private async adoptSave(previous: Record<string, unknown> | null): Promise<void> {
    if (!previous) return
const currentId = this.pb.authStore.model?.id as string | undefined
    if (!previous || !currentId) return
    try {
      await this.pb
        .collection(SAVES_COLLECTION)
        .getFirstListItem(this.pb.filter('user = {:id}', { id: currentId }))
      return
    } catch (err) {
      if (!isNotFound(err)) {
        // Existing save may be unreadable - never overwrite it blindly.
        console.error('[PocketBase] checking account save failed:', err)
        return
      }
      // no save on the account yet - fall through and adopt
    }
    try {
      await this.pb.collection(SAVES_COLLECTION).create({ user: currentId, game: previous.game })
    } catch (err) {
      console.error('[PocketBase] adopting previous save failed:', err)
    }
  }
}

/**
 * Session-recovery policy: which stored identity, if any, may be resumed
 * without asking the player for a password.
 *
 * Exported (and covered by scripts/verify-game.ts) because the rule is a
 * security-relevant invariant that would otherwise be buried in a long async
 * method, where a refactor could easily reintroduce the bug:
 *
 *   - `account`  -> never. The account flag carries no password, and the pilot
 *     credentials sharing this browser belong to a *different*, older identity.
 *     `register`/`login` copy the pilot's save into the account but leave the
 *     old pilot record in place, so authenticating with those credentials
 *     would silently drop the player into a stale pilot holding an out-of-date
 *     save - and report success, because that pilot still exists.
 *   - `pilot`    -> yes. These credentials were minted for this browser and
 *     nothing else shares them.
 *   - `none`     -> first use; mint a fresh pilot.
 */
export function resumableIdentity(
  account: AccountFlag | null,
  pilot: PilotCredentials | null,
): 'account-needs-login' | 'pilot' | 'none' {
  if (account) return 'account-needs-login'
  if (pilot) return 'pilot'
  return 'none'
}

/**
 * GameStore backed by a PocketBase server.
 *
 * By default each browser gets its own persistent anonymous PocketBase account,
 * created lazily on first use, so every device keeps its own save. Signing up /
 * signing in through `auth` switches the save to a real account instead. The
 * session token is stored by the SDK's auth store, so a reload on the same
 * browser finds it again; expired sessions are resumed via token refresh, and
 * failing that via the stored pilot credentials, so the identity - and its
 * save - survive token expiry. See `resumableIdentity` for the rule that keeps
 * a registered account from ever being resumed as a pilot.
 */
export class PocketBaseGameStore implements GameStore {
  readonly auth: AuthStore
  onPilotLost?: (reason: SessionLostReason) => void

  private readonly pb: PocketBase
  private initPromise: Promise<void> | null = null
  private initPending = false
  private saveChain: Promise<unknown> = Promise.resolve()
  // Coalescing: only the newest snapshot per burst needs to reach the server.
  // Each drained snapshot remembers the identity (and generation) it belongs
  // to, so a queued write can never land on - or clobber - a different account,
  // and a clear() forces everything queued before it to be dropped.
  private pendingSave: { state: GameState; userId: string; generation: number } | null = null
  private generation = 0
  // Baseline used to detect another tab/device overwriting our save (PB writes
  // are last-write-wins). Pinned to the identity it was captured under so an
  // account switch (register/login) never false-positives against the previous
  // pilot's record.
  private lastUpdatedForUser: { userId: string; updated: string | null } | null = null

  constructor(url: string) {
    this.pb = new PocketBase(url)
    this.auth = new PocketBaseAuthStore(
      this.pb,
      () => this.init(),
      () => this.resetSession(),
    )
  }

  async load(): Promise<GameState | null> {
    let record: Record<string, unknown> | null = null
    let serverError: unknown = null
    try {
      record = await this.findSaveRecord()
    } catch (err) {
      serverError = err
      console.error('[PocketBase] load failed:', err)
    }

    if (record) {
      const currentId = this.pb.authStore.model?.id as string | undefined
      if (currentId) {
        this.lastUpdatedForUser = { userId: currentId, updated: (record.updated as string | undefined) ?? null }
      }
      const raw = record.game as GameState | null
      if (raw && typeof raw === 'object' && raw.version != null) {
        try {
          return migrate(raw)
        } catch (err) {
          // A corrupt server save must not look like "no save" - otherwise a
          // new game could silently overwrite it. Surface the error instead.
          console.error('[PocketBase] saved game failed to migrate:', err)
          throw err
        }
      }
    }

    // No usable server save (or the server is unreachable): fall back to any
    // local save this browser still has.
    const local = this.readLocalSave()
    if (local) {
      if (serverError == null) {
        try {
          await this.save(local)
          this.removeLocalSave()
        } catch (err) {
          console.error('[PocketBase] adopting local save failed:', err)
        }
      }
      return local
    }

    // Nothing local either. An unreachable server must NOT look like an empty
    // profile - rethrow so the caller can surface the failure instead of
    // offering a destructive "new game" that would overwrite the real save.
    if (serverError != null) throw serverError
    return null
  }

  async save(state: GameState): Promise<void> {
    await this.init()
    const userId = this.pb.authStore.model?.id as string
    // Serialize saves so rapid commits can't race the create/update decision,
    // and coalesce: a burst of commits collapses onto the newest snapshot, so
    // the server write backlog never grows unboundedly (a many-tasks-deep
    // queue risks losing the latest moves if the tab closes mid-backlog).
    this.pendingSave = { state, userId, generation: this.generation }
    const task = this.saveChain.then(() => this.drainSaves(this.generation))
    this.saveChain = task.catch(() => undefined)
    await task
  }

  private async drainSaves(generation: number): Promise<void> {
    while (this.pendingSave && this.pendingSave.generation === generation) {
      const { state: snapshot, userId } = this.pendingSave
      this.pendingSave = null
      // The identity may have switched while this write was queued (login /
      // logout / reset) - acting now would write stale state into - or worse,
      // overwrite - the *new* identity's save, so drop the queued write.
      if (this.pb.authStore.model?.id !== userId) continue
      const existing = await this.findSaveRecord()
      if (existing) {
        // Another tab/device may have written since we last loaded *this
        // identity's* save. Refuse to clobber it silently - surface a conflict
        // so the player can reload and merge their moves instead of losing one
        // side wholesale.
        const remoteUpdated = existing.updated as string | undefined
        const baseline = this.lastUpdatedForUser
        const conflict =
          baseline != null &&
          baseline.userId === userId &&
          baseline.updated != null &&
          remoteUpdated != null &&
          remoteUpdated > baseline.updated
        if (conflict) {
          throw new Error('Save was changed in another window or device. Reload to continue.')
        }
        const saved = await this.pb.collection(SAVES_COLLECTION).update(existing.id as string, { game: snapshot })
        this.lastUpdatedForUser = {
          userId,
          updated: (saved.updated as string | undefined) ?? remoteUpdated ?? null,
        }
      } else {
        const saved = await this.pb.collection(SAVES_COLLECTION).create({ user: userId, game: snapshot })
        this.lastUpdatedForUser = { userId, updated: (saved.updated as string | undefined) ?? null }
      }
      // The server now holds this state; drop any stale local backup.
      this.removeLocalSave()
    }
  }

  async clear(): Promise<void> {
    this.removeLocalSave()
    await this.init()
    const userId = this.pb.authStore.model?.id as string
    // Anything queued before a clear must not be written afterwards: bump the
    // generation so earlier drain tasks stop consuming the shared pending slot.
    this.generation++
    this.pendingSave = null
    // Ride the save chain so a still-queued save() runs first - otherwise a
    // commit followed by "reset game" could delete, then re-create, the record.
    const task = this.saveChain.then(async () => {
      // Same guard as save(): a queued clear must never delete the record of
      // an identity that has since been signed into.
      if (this.pb.authStore.model?.id !== userId) return
      const record = await this.findSaveRecord()
      if (record) {
        await this.pb.collection(SAVES_COLLECTION).delete(record.id as string)
      }
    })
    this.saveChain = task.catch(() => undefined)
    await task
  }

  private init(): Promise<void> {
    if (this.initPromise) {
      // Reuse an in-flight session attempt, or a settled session that is still
      // valid. A settled-but-stale session (a long-running tab whose auth token
      // expired mid-game) falls through and is re-established - otherwise the
      // next save/load would fail or, worse, look like an empty profile.
      if (this.initPending || this.pb.authStore.isValid) {
        return this.initPromise
      }
    }
    this.initPending = true
    this.initPromise = this.ensureSession()
      .catch((err) => {
        // Never cache a failed session attempt - the next save/load must retry
        // (e.g. once the network is back) instead of failing forever.
        this.initPromise = null
        throw err
      })
      .finally(() => {
        this.initPending = false
      })
    return this.initPromise
  }

  private resetSession(): void {
    this.initPromise = null
    this.initPending = false
  }

  private async ensureSession(): Promise<void> {
    if (this.pb.authStore.isValid && this.pb.authStore.model) {
      return
    }

    // Stored session with an expired access token: refresh it so the *same*
    // identity is kept. This runs for anonymous pilots too - without it, token
    // expiry would silently mint a new pilot and orphan its save.
    if (this.pb.authStore.model) {
      try {
        await this.pb.collection(USERS_COLLECTION).authRefresh()
        if (this.pb.authStore.isValid && this.pb.authStore.model) return
      } catch (err) {
        // Transient failure (offline, server down): keep the identity and let
        // the caller retry instead of abandoning it.
        if (!isAuthRejection(err)) throw err
        this.pb.authStore.clear()
      }
    }

    // From here we can no longer resume the current session. `resumableIdentity`
    // encodes why a registered account is never resumed as a pilot.
    const account = readAccountFlag()
    const pilot = readPilotCredentials()
    const resumable = resumableIdentity(account, pilot)

    if (resumable === 'account-needs-login') {
      // Cannot resume the account without its password (the flag holds only
      // email and name), so mint a fresh pilot to keep the game playable and
      // tell the player to sign in again.
      clearAccountFlag()
      this.onPilotLost?.('account')
    } else if (resumable === 'pilot' && pilot) {
      // No account on this browser: fall back to the stored pilot credentials.
      // Covers the case where even the refresh token has expired (or the SDK
      // storage was lost).
      try {
        await this.pb.collection(USERS_COLLECTION).authWithPassword(pilot.email, pilot.password)
        if (this.pb.authStore.isValid && this.pb.authStore.model) return
      } catch (err) {
        if (!isAuthRejection(err)) throw err
        clearPilotCredentials() // pilot is gone - mint a fresh one below
        // The old pilot may own a save record we can never reach (its identity
        // is rejected, not just its session). Surface that so the player isn't
        // silently restarted from 1200 cr with no explanation.
        this.onPilotLost?.('pilot')
      }
    }

    // First use (or the previous pilot is unrecoverable): a new anonymous pilot.
    const email = `pilot-${randomString(12, EMAIL_CHARS)}@sorstar.local`
    const password = randomString(24, PASSWORD_CHARS)
    await this.pb.collection(USERS_COLLECTION).create({
      email,
      password,
      passwordConfirm: password,
      name: 'Anonymous Pilot',
    })
    // Persist before signing in, so a failure between create and auth cannot
    // orphan the freshly created account.
    writePilotCredentials({ email, password })
    await this.pb.collection(USERS_COLLECTION).authWithPassword(email, password)
  }

  private async findSaveRecord(): Promise<Record<string, unknown> | null> {
    await this.init()
    const userId = this.pb.authStore.model?.id as string | undefined
    if (!userId) return null
    try {
      return await this.pb
        .collection(SAVES_COLLECTION)
        .getFirstListItem(this.pb.filter('user = {:id}', { id: userId }))
    } catch (err) {
      // 404 = no save on the account yet; anything else is an infrastructure
      // error and must not be mistaken for "no save".
      if (isNotFound(err)) return null
      throw err
    }
  }

  private readLocalSave(): GameState | null {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as GameState
      if (!parsed || typeof parsed !== 'object' || parsed.version == null) return null
      return migrate(parsed)
    } catch {
      return null
    }
  }

  private removeLocalSave(): void {
    try {
      window.localStorage.removeItem(SAVE_KEY)
    } catch {
      // noop
    }
  }
}
