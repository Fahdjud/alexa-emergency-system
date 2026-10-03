/*
 * stored-value.ts: a small value remembered in this browser (localStorage)
 * that React components can subscribe to with useSyncExternalStore.
 *
 * Why this file exists: the monitor remembers the chosen language and the
 * device token across reloads. Reading localStorage during render breaks
 * server rendering, and storage can be unavailable (private windows), so
 * this handles both once. Values live only in this browser.
 */

export type StoredValue<T> = {
  subscribe: (listener: () => void) => () => void
  read: () => T
  /** What the server render uses (it cannot see localStorage). */
  readOnServer: () => T
  write: (value: T) => void
}

export function createStoredValue<T extends string>(key: string, fallback: T, isValid: (value: string) => value is T): StoredValue<T> {
  const listeners = new Set<() => void>()
  let memory = fallback // used when storage is unavailable

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    read() {
      try {
        const value = localStorage.getItem(key)
        return value !== null && isValid(value) ? value : memory
      } catch {
        return memory
      }
    },
    readOnServer: () => fallback,
    write(value) {
      memory = value
      try {
        localStorage.setItem(key, value)
      } catch {
        // Not remembered after a reload, but still applied now.
      }
      listeners.forEach((listener) => listener())
    },
  }
}
