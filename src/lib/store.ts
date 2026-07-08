import type { Settings, Tracking } from '../types'

const KEY = 'btt:v1'

export interface Persisted {
  settings: Settings
  tracking: Tracking
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  tzMode: 'local',
  lateNight: false,
  weekStart: 1,
  friends: [],
}

export function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
        tracking: { status: p.tracking?.status ?? {}, watched: p.tracking?.watched ?? {} },
      }
    }
  } catch {}
  return { settings: { ...DEFAULT_SETTINGS }, tracking: { status: {}, watched: {} } }
}

export function savePersisted(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {}
}
