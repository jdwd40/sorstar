const SOUND_KEY = 'sorstar.sound'

let ctx: AudioContext | null = null
let enabled = true
if (typeof window !== 'undefined') {
  try {
    enabled = window.localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    enabled = true
  }
}

export function soundEnabled(): boolean {
  return enabled
}

export function setSoundEnabled(on: boolean): void {
  enabled = on
  try {
    window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    // noop
  }
  if (!on) {
    ctx?.close().catch(() => {})
    ctx = null
  }
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined' || !enabled) return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(
  freq: number,
  start: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; slideTo?: number } = {},
): void {
  const ac = ensure()
  if (!ac) return
  const { type = 'sine', gain = 0.12, slideTo } = opts
  const t0 = ac.currentTime + start
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise(start: number, dur: number, filterFreq: number, slideTo = filterFreq, gain = 0.1): void {
  const ac = ensure()
  if (!ac) return
  const t0 = ac.currentTime + start
  const buffer = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(filterFreq, t0)
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

export const sound = {
  buy(): void {
    tone(660, 0, 0.09, { type: 'triangle', gain: 0.1 })
    tone(880, 0.08, 0.16, { type: 'triangle', gain: 0.1 })
  },
  sell(): void {
    tone(740, 0, 0.08, { type: 'triangle', gain: 0.1 })
    tone(980, 0.07, 0.1, { type: 'triangle', gain: 0.1 })
    tone(660, 0.16, 0.22, { type: 'triangle', gain: 0.08, slideTo: 440 })
  },
  wait(): void {
    tone(330, 0, 0.4, { type: 'sine', gain: 0.05, slideTo: 220 })
  },
  travel(): void {
    noise(0, 0.5, 200, 2600, 0.16)
    tone(90, 0.05, 0.5, { type: 'sawtooth', gain: 0.06, slideTo: 1400 })
  },
  error(): void {
    tone(220, 0, 0.18, { type: 'square', gain: 0.07 })
    tone(180, 0.12, 0.22, { type: 'square', gain: 0.06 })
  },
  upgrade(): void {
    tone(440, 0, 0.12)
    tone(550, 0.1, 0.12)
    tone(660, 0.2, 0.25)
  },
  win(): void {
    tone(523.25, 0, 0.14, { type: 'triangle', gain: 0.1 })
    tone(659.25, 0.13, 0.14, { type: 'triangle', gain: 0.1 })
    tone(783.99, 0.26, 0.14, { type: 'triangle', gain: 0.1 })
    tone(1046.5, 0.39, 0.42, { type: 'triangle', gain: 0.12 })
  },
}