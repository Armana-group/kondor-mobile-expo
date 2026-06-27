/**
 * Transaction-history helpers.
 *
 * The Koinos account-history list endpoint (/v1/account/{addr}/history) does NOT
 * include block time, so transaction timestamps must be fetched per-transaction
 * from /v1/transaction/{id} (which returns `transaction.timestamp` in ms).
 * These helpers are pure/injectable so they can be unit-tested without network.
 */

/**
 * Extract the millisecond block timestamp from a /v1/transaction/{id} response.
 * Returns undefined when absent or non-positive (so callers can fall back honestly
 * instead of faking Date.now()).
 */
export function parseTransactionTimestamp(data: any): number | undefined {
  const ts = data?.transaction?.timestamp;
  if (ts === undefined || ts === null) return undefined;
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface FetchTimestampsOptions {
  /** REST base that serves /v1/transaction/{id}, e.g. https://seed.koinosfoundation.org */
  baseUrl: string;
  /** Injectable fetch (defaults to global fetch) — for testing. Narrowed to the
   *  subset we use so a simple mock satisfies it (real fetch is assignable). */
  fetchImpl?: (url: string) => Promise<{ ok: boolean; json: () => Promise<any> }>;
  /** Cache of txId -> ms timestamp. Confirmed txs never change, so this avoids
   *  refetching on the history hook's periodic refresh. Pass a persistent Map. */
  cache?: Map<string, number>;
  /** Optional scope prefix so different network/address histories never share
   *  the same cached timestamp entry for an identical tx id. */
  cacheKeyPrefix?: string;
}

export function buildTxTimestampCacheKey(id: string, prefix?: string): string {
  return prefix ? `${prefix}:${id}` : id;
}

/**
 * Resolve millisecond timestamps for the given transaction ids.
 * Cached ids are served from cache; uncached ids are fetched in parallel.
 * Failed lookups are omitted (never throw) so a single bad id can't break history.
 */
export async function fetchTransactionTimestamps(
  ids: string[],
  opts: FetchTimestampsOptions
): Promise<Map<string, number>> {
  const {
    baseUrl,
    fetchImpl = fetch,
    cache = new Map<string, number>(),
    cacheKeyPrefix,
  } = opts;
  const result = new Map<string, number>();
  const toFetch: string[] = [];

  for (const id of ids) {
    const cached = cache.get(buildTxTimestampCacheKey(id, cacheKeyPrefix));
    if (cached !== undefined) result.set(id, cached);
    else if (id) toFetch.push(id);
  }

  await Promise.all(
    toFetch.map(async (id) => {
      try {
        // return_receipt=true reliably surfaces transaction.timestamp (explicit
        // all-false params strip it on some nodes).
        const url = `${baseUrl}/v1/transaction/${id}?return_receipt=true`;
        const resp = await fetchImpl(url);
        if (!resp.ok) return;
        const data = await resp.json();
        const ts = parseTransactionTimestamp(data);
        if (ts !== undefined) {
          cache.set(buildTxTimestampCacheKey(id, cacheKeyPrefix), ts);
          result.set(id, ts);
        }
      } catch {
        // Graceful: omit this id; caller falls back to "no timestamp".
      }
    })
  );

  return result;
}
