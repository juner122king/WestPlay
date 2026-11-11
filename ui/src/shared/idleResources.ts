/** Shared idle lifetime for media pages and map rendering resources. */
export const RESOURCE_IDLE_MS = 30_000

/** A cancellable idle deadline. Repeated idle reports keep the original deadline. */
export function idleDisposal(dispose: () => void, delay = RESOURCE_IDLE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    idle() {
      timer ??= setTimeout(() => {
        timer = null
        dispose()
      }, delay)
    },
    cancel() {
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}

/** Only the two most recently used map versions stay referenced. Failed loads can be retried. */
export class MapResourceCache<T> {
  private entries = new Map<string, Promise<T | null>>()

  load(key: string, fetcher: () => Promise<T | null>): Promise<T | null> {
    const existing = this.entries.get(key)
    if (existing) {
      this.entries.delete(key)
      this.entries.set(key, existing)
      return existing
    }
    const result = fetcher()
      .catch(() => null)
      .then((value) => {
        if (value === null && this.entries.get(key) === result) this.entries.delete(key)
        return value
      })
    this.entries.set(key, result)
    while (this.entries.size > 2) this.entries.delete(this.entries.keys().next().value!)
    return result
  }
}
