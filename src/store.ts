import { DataAdapter, debounce } from "obsidian";
import { BATCH_SIZE, fetchIssue, fetchIssues } from "./linear";
import { CacheEntry } from "./types";

const OPEN_TTL_MS = 15 * 60 * 1000;
const SETTLED_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 2000;
const BATCH_DEBOUNCE_MS = 150;
const BATCH_BACKOFF_MS = 60 * 1000;
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
  private listeners = new Set<(ids: string[]) => void>();
  private wanted = new Set<string>();
  private batching = new Set<string>();
  private flushBatch = debounce(() => void this.loadWanted(), BATCH_DEBOUNCE_MS, true);
  private batchBlockedUntil = 0;

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

  /** Called with the IDs whose cached data just changed. Returns the unsubscribe function. */
  onChange(listener: (ids: string[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Asks for these tickets to be loaded if they're missing or stale. Calls made close
   * together (a note's render passes) collapse into one batched request per team.
   */
  ensure(ids: Iterable<string>): void {
    if (Date.now() < this.batchBlockedUntil) return;
    for (const id of ids) {
      const entry = this.entries.get(id);
      const loading = this.inFlight.has(id) || this.batching.has(id);
      if ((!entry || !this.isFresh(entry)) && !loading) this.wanted.add(id);
    }
    if (this.wanted.size > 0) this.flushBatch();
  }

  /** Concurrent callers for the same ticket share one request. Failures are never cached. */
  refresh(id: string): Promise<CacheEntry> {
    const pending = this.inFlight.get(id);
    if (pending) return pending;

    const request = fetchIssue(this.getApiKey(), id)
      .then((issue) => {
        const entry = this.put(id, issue);
        this.commit([id]);
        return entry;
      })
      .finally(() => this.inFlight.delete(id));

    this.inFlight.set(id, request);
    return request;
  }

  private async loadWanted(): Promise<void> {
    const byTeam = new Map<string, string[]>();
    for (const id of this.wanted) {
      const team = id.slice(0, id.lastIndexOf("-"));
      byTeam.set(team, [...(byTeam.get(team) ?? []), id]);
    }
    this.wanted.clear();

    for (const [team, ids] of byTeam) {
      for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
        await this.loadChunk(team, ids.slice(offset, offset + BATCH_SIZE));
      }
    }
  }

  private async loadChunk(team: string, ids: string[]): Promise<void> {
    for (const id of ids) this.batching.add(id);
    try {
      const numbers = ids.map((id) => Number(id.slice(id.lastIndexOf("-") + 1)));
      const issues = await fetchIssues(this.getApiKey(), team, numbers);
      for (const issue of issues) this.put(issue.identifier, issue);
      this.commit(issues.map((issue) => issue.identifier));

      // Absent from the batch isn't proof of absence (see fetchIssues); the single lookup settles it.
      const found = new Set(issues.map((issue) => issue.identifier));
      for (const id of ids) if (!found.has(id)) this.refresh(id).catch(() => undefined);
    } catch {
      // No key, bad key, offline: inline previews just don't appear. Back off so renders don't hammer Linear.
      this.batchBlockedUntil = Date.now() + BATCH_BACKOFF_MS;
    } finally {
      for (const id of ids) this.batching.delete(id);
    }
  }

  private put(id: string, issue: CacheEntry["issue"]): CacheEntry {
    const entry: CacheEntry = { fetchedAt: Date.now(), issue };
    this.entries.delete(id);
    this.entries.set(id, entry);
    return entry;
  }

  private commit(ids: string[]): void {
    if (ids.length === 0) return;
    this.evict();
    this.persist();
    for (const listener of this.listeners) listener(ids);
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
