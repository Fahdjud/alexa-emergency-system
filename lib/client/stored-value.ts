/*
 * A localStorage-backed value that components can read with
 * useSyncExternalStore. Handles server rendering and unavailable storage
 * (private windows).
 */

export type StoredValue<T> = {
  subscribe: (listener: () => void) => () => void
  read: () => T
  /** What the server render uses (it cannot see localStorage). */
  readOnServer: () => T
  write: (value: T) => void
}

export function createStoredValue<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T
): StoredValue<T> {
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
