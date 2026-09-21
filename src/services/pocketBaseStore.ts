import PocketBase from 'pocketbase'
import type { GameState } from '../types/game'
import { SAVE_KEY } from '../data/gameData'
import { migrate } from './migrate'
import type { GameStore } from './gameStore'

const USERS_COLLECTION = 'users'
const SAVES_COLLECTION = 'saves'

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

/**
 * GameStore backed by a PocketBase server.
 *
 * Each browser gets its own persistent anonymous PocketBase account, created
 * lazily on first use, so every device keeps its own save. The session token is
 * stored by the SDK's auth store, so a reload on the same browser finds it again.
 */
export class PocketBaseGameStore implements GameStore {
  private readonly pb: PocketBase
  private initPromise: Promise<void> | null = null

  constructor(url: string) {
    this.pb = new PocketBase(url)
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
    const existing = await this.findSaveRecord()
    if (existing) {
      await this.pb.collection(SAVES_COLLECTION).update(existing.id as string, { game: state })
    } else {
      await this.pb.collection(SAVES_COLLECTION).create({ user: userId, game: state })
    }
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