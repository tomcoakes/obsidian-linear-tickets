import { DataAdapter, debounce } from "obsidian";
import { fetchIssue } from "./linear";
import { CacheEntry } from "./types";

const OPEN_TTL_MS = 15 * 60 * 1000;
const SETTLED_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const SETTLED_STATES = new Set(["completed", "canceled"]);

/**
 * Ticket cache with stale-while-revalidate semantics: callers render `peek()`
 * immediately and call `refresh()` when `isFresh()` says the entry has aged out.
 * Persisted beside data.json but in its own file, which Obsidian Sync ignores.
 */
export class IssueStore {
  private entries = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<CacheEntry>>();
  private persist = debounce(() => void this.save(), 5000, true);

  constructor(
    private adapter: DataAdapter,
    private cachePath: string,
    private getApiKey: () => string | null,
  ) {}

  async load(): Promise<void> {
    try {
      if (!(await this.adapter.exists(this.cachePath))) return;
      const raw = JSON.parse(await this.adapter.read(this.cachePath)) as Record<string, CacheEntry>;
      this.entries = new Map(Object.entries(raw));
    } catch {
      this.entries = new Map();
    }
  }

  peek(id: string): CacheEntry | undefined {
    return this.entries.get(id);
  }

  isFresh(entry: CacheEntry): boolean {
    const settled = entry.issue !== null && SETTLED_STATES.has(entry.issue.state.type);
    return Date.now() - entry.fetchedAt < (settled ? SETTLED_TTL_MS : OPEN_TTL_MS);
  }

  /** Concurrent callers for the same ticket share one request. Failures are never cached. */
  refresh(id: string): Promise<CacheEntry> {
    const pending = this.inFlight.get(id);
    if (pending) return pending;

    const request = fetchIssue(this.getApiKey(), id)
      .then((issue) => {
        const entry: CacheEntry = { fetchedAt: Date.now(), issue };
        this.entries.delete(id);
        this.entries.set(id, entry);
        this.evict();
        this.persist();
        return entry;
      })
      .finally(() => this.inFlight.delete(id));

    this.inFlight.set(id, request);
    return request;
  }

  async clear(): Promise<void> {
    this.entries.clear();
    await this.save();
  }

  async save(): Promise<void> {
    try {
      await this.adapter.write(this.cachePath, JSON.stringify(Object.fromEntries(this.entries)));
    } catch (error) {
      console.error("linear-tickets: failed to write cache", error);
    }
  }

  // Map preserves insertion order and refresh() re-inserts, so the head is the least recently fetched.
  private evict(): void {
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }
}
