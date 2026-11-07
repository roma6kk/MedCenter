import type { CacheStore } from '../redis-cache.service';

export class InMemoryCacheStore implements CacheStore {
  readonly entries = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.entries.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.entries.set(key, value);
  }

  async del(keys: string[]): Promise<void> {
    keys.forEach((key) => this.entries.delete(key));
  }

  async delByPrefix(prefix: string): Promise<void> {
    [...this.entries.keys()]
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => this.entries.delete(key));
  }
}
