export type PoolResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

export async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void
): Promise<Array<PoolResult<R>>> {
  const results = new Array<PoolResult<R>>(items.length);
  let index = 0;
  let done = 0;

  async function next(): Promise<void> {
    const current = index;
    index += 1;
    if (current >= items.length) return;

    try {
      results[current] = { ok: true, value: await worker(items[current], current) };
    } catch (error) {
      results[current] = {
        ok: false,
        error: error instanceof Error ? error : new Error("처리에 실패했습니다.")
      };
    }

    done += 1;
    onProgress?.(done, items.length);
    await next();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}
