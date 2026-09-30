import { useState, type FormEvent } from 'react'
import Modal from './Modal'
import { useGame } from '../context/GameContext'

type AuthMode = 'login' | 'register'

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const { login, register, authBusy, authAvailable } = useGame()
  const [mode, setMode] = useState<AuthMode>('register')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!authAvailable) {
    return (
      <Modal onClose={onClose} labelledBy="auth-unavailable-title">
        <h2 id="auth-unavailable-title" className="text-xl font-bold mb-2">
          Accounts unavailable
        </h2>
        <p className="text-slate-300 text-sm mb-6">
          Saves are stored in this browser only. Start the app with a
          PocketBase backend (<code>VITE_PB_URL</code>) to unlock accounts.
        </p>
        <button onClick={onClose} className="btn-primary w-full">
          Close
        </button>
      </Modal>
    )
  }

  const isRegister = mode === 'register'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const result = isRegister
        ? await register(email, password, name)
        : await login(email, password)
      if (result) {
        setError(result)
        return
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setError(null)
  }

  return (
    <Modal onClose={onClose} labelledBy="auth-title">
      <h2 id="auth-title" className="text-xl font-bold mb-1">
        {isRegister ? 'Create an account' : 'Sign in'}
      </h2>
      <p className="text-slate-400 text-sm mb-6">
        {isRegister
          ? 'Your save moves from this anonymous pilot to an account you can use on any device.'
          : 'Your save is looked up on this account. Sign in on any device to keep playing.'}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isRegister && (
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Name (optional)
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pilot"
              className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-white"
              autoComplete="name"
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-white"
            autoComplete="email"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
            className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-white"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
            minLength={isRegister ? 8 : undefined}
          />
        </label>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" className="btn-primary w-full py-2.5" disabled={authBusy}>
          {authBusy ? 'Working…' : isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <div className="mt-4 text-center text-sm text-slate-400">
        {isRegister ? (
          <>
            Already have an account?{' '}
            <button onClick={() => switchMode('login')} className="text-indigo-300 hover:text-indigo-200">
              Sign in
            </button>
          </>
        ) : (
          <>
            New here?{' '}
            <button onClick={() => switchMode('register')} className="text-indigo-300 hover:text-indigo-200">
              Create an account
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}