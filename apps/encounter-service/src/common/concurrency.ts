// Caps in-flight terminology lookups so a burst cannot flood HAPI.
export async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  task: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array<TResult>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index] as TItem);
    }
  };
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
