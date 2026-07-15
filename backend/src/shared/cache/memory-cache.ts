export type CacheValue = NonNullable<unknown>;

export interface CacheLoadResult<T extends CacheValue> {
  readonly value: T;
  readonly cached: boolean;
}

interface Entry<T extends CacheValue> {
  readonly value: T;
  readonly expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 1_000;

export class MemoryCache<T extends CacheValue> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly pending = new Map<string, Promise<CacheLoadResult<T>>>();

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error("Cache max entries must be a positive integer.");
    }
  }

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("Cache TTL must be a positive finite number.");
    }
    const now = this.clock();
    for (const [storedKey, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(storedKey);
    }
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  load(options: {
    readonly key: string;
    readonly loader: () => Promise<T>;
    readonly ttlFor: (value: T) => number;
  }): Promise<CacheLoadResult<T>> {
    const hit = this.get(options.key);
    if (hit !== null) return Promise.resolve({ value: hit, cached: true });
    const existing = this.pending.get(options.key);
    if (existing) return existing;
    const operation: Promise<CacheLoadResult<T>> = Promise.resolve()
      .then(() => options.loader())
      .then((value) => {
        this.set(options.key, value, options.ttlFor(value));
        return { value, cached: false };
      })
      .finally(() => {
        this.pending.delete(options.key);
      });
    this.pending.set(options.key, operation);
    return operation;
  }
}
