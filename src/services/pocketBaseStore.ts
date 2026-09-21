import PocketBase from 'pocketbase'
import type { GameState } from '../types/game'
import { SAVE_KEY } from '../data/gameData'
import { migrate } from './migrate'
import type { AuthStore, AuthUser, GameStore } from './gameStore'

const USERS_COLLECTION = 'users'
const SAVES_COLLECTION = 'saves'

/** Marks a PocketBase account as chosen by this browser (as opposed to the throwaway anonymous pilot). */
const ACCOUNT_FLAG_KEY = 'sorstar.pb.account'

interface AccountFlag {
  email: string
  name: string
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

function randomString(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}

const EMAIL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const PASSWORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'

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
  private readonly pb: PocketBase

  constructor(pb: PocketBase) {
    this.pb = pb
  }

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
    const previous = await this.captureCurrentSave()
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
    await this.adoptSave(previous)
    return null
  }

  async login(email: string, password: string): Promise<string | null> {
    const previous = await this.captureCurrentSave()
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
    await this.adoptSave(previous)
    return null
  }

  async logout(): Promise<void> {
    this.pb.authStore.clear()
    clearAccountFlag()
  }

  /** Reads the save belonging to the current (pre-switch) identity. */
  private async captureCurrentSave(): Promise<Record<string, unknown> | null> {
    const currentId = this.pb.authStore.model?.id as string | undefined
    if (!currentId) return null
    try {
      return await this.pb.collection(SAVES_COLLECTION).getFirstListItem(`user = "${currentId}"`)
    } catch {
      return null
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
    if (!currentId) return
    try {
      await this.pb.collection(SAVES_COLLECTION).getFirstListItem(`user = "${currentId}"`)
      return
    } catch {
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
 * GameStore backed by a PocketBase server.
 *
 * By default each browser gets its own persistent anonymous PocketBase account,
 * created lazily on first use, so every device keeps its own save. Signing up /
 * signing in through `auth` switches the save to a real account instead. The
 * session token is stored by the SDK's auth store, so a reload on the same
 * browser finds it again.
 */
export class PocketBaseGameStore implements GameStore {
  readonly auth: AuthStore

  private readonly pb: PocketBase
  private initPromise: Promise<void> | null = null
  private saveChain: Promise<unknown> = Promise.resolve()

  constructor(url: string) {
    this.pb = new PocketBase(url)
    this.auth = new PocketBaseAuthStore(this.pb)
  }

  async load(): Promise<GameState | null> {
    try {
      const record = await this.findSaveRecord()
      if (record) {
        const raw = record.game as GameState | null
        if (raw && typeof raw === 'object' && raw.version != null) {
          return migrate(raw)
        }
      }
      // Nothing on the server yet - adopt an existing local save if present.
      const local = this.readLocalSave()
      if (local) {
        try {
          await this.save(local)
          this.removeLocalSave()
        } catch (err) {
          console.error('[PocketBase] adopting local save failed:', err)
        }
        return local
      }
      return null
    } catch (err) {
      console.error('[PocketBase] load failed:', err)
      return null
    }
  }

  async save(state: GameState): Promise<void> {
    await this.init()
    const userId = this.pb.authStore.model?.id as string
    // Serialize saves so rapid commits can't race the create/update decision.
    const task = this.saveChain.then(async () => {
      const existing = await this.findSaveRecord()
      if (existing) {
        await this.pb.collection(SAVES_COLLECTION).update(existing.id as string, { game: state })
      } else {
        await this.pb.collection(SAVES_COLLECTION).create({ user: userId, game: state })
      }
    })
    this.saveChain = task.catch(() => undefined)
    await task
  }

  async clear(): Promise<void> {
    this.removeLocalSave()
    const record = await this.findSaveRecord()
    if (record) {
      await this.pb.collection(SAVES_COLLECTION).delete(record.id as string)
    }
  }

  private init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.ensureSession()
    }
    return this.initPromise
  }

  private async ensureSession(): Promise<void> {
    if (this.pb.authStore.isValid && this.pb.authStore.model) {
      return
    }
    // A registered account whose token can't be refreshed should stay with the
    // account instead of silently becoming a brand-new anonymous pilot.
    if (readAccountFlag()) {
      try {
        await this.pb.collection(USERS_COLLECTION).authRefresh()
        if (this.pb.authStore.isValid && this.pb.authStore.model) return
      } catch {
        clearAccountFlag()
      }
    }
    const email = `pilot-${randomString(12, EMAIL_CHARS)}@sorstar.local`
    const password = randomString(24, PASSWORD_CHARS)
    await this.pb.collection(USERS_COLLECTION).create({
      email,
      password,
      passwordConfirm: password,
      name: 'Anonymous Pilot',
    })
    await this.pb.collection(USERS_COLLECTION).authWithPassword(email, password)
  }

  private async findSaveRecord(): Promise<Record<string, unknown> | null> {
    await this.init()
    const userId = this.pb.authStore.model?.id as string | undefined
    if (!userId) return null
    try {
      return await this.pb.collection(SAVES_COLLECTION).getFirstListItem(`user = "${userId}"`)
    } catch {
      return null
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