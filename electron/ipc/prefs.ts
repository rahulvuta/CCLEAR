import Store from 'electron-store'
import type { Prefs } from '../../src/shared/types'

const defaults: Prefs = {
  focusModeEnabled: false
}

const store = new Store<{ prefs: Prefs }>({
  name: 'cclear-browser-preferences',
  defaults: {
    prefs: defaults
  }
})

export function getPrefs(): Prefs {
  const p = store.get('prefs')
  return {
    ...defaults,
    ...p
  }
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...patch }
  store.set('prefs', next)
  return next
}
