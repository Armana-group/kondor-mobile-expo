import { parseTransactionTimestamp, fetchTransactionTimestamps } from '../txHistory';

describe('parseTransactionTimestamp', () => {
  it('extracts a numeric ms timestamp from the tx endpoint response', () => {
    expect(parseTransactionTimestamp({ transaction: { timestamp: 1781789651090 } })).toBe(1781789651090);
  });

  it('coerces a string uint64 timestamp to a number', () => {
    expect(parseTransactionTimestamp({ transaction: { timestamp: '1781789651090' } })).toBe(1781789651090);
  });

  it('returns undefined when no timestamp is present', () => {
    expect(parseTransactionTimestamp({ transaction: {} })).toBeUndefined();
    expect(parseTransactionTimestamp({})).toBeUndefined();
    expect(parseTransactionTimestamp(null)).toBeUndefined();
    expect(parseTransactionTimestamp({ transaction: { timestamp: '0' } })).toBeUndefined();
  });
});

describe('fetchTransactionTimestamps', () => {
  const makeFetch = (responses: Record<string, any>) =>
    jest.fn(async (url: string) => {
      const id = url.split('/transaction/')[1].split('?')[0];
      if (responses[id] === 'ERROR') throw new Error('network down');
      return { ok: true, json: async () => responses[id] } as any;
    });

  it('fetches timestamps for uncached ids in parallel', async () => {
    const fetchImpl = makeFetch({
      '0xAAA': { transaction: { timestamp: 1000 } },
      '0xBBB': { transaction: { timestamp: 2000 } },
    });
    const cache = new Map<string, number>();
    const res = await fetchTransactionTimestamps(['0xAAA', '0xBBB'], { baseUrl: 'https://seed', fetchImpl, cache });
    expect(res.get('0xAAA')).toBe(1000);
    expect(res.get('0xBBB')).toBe(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('serves cached ids without refetching and populates the cache for new ones', async () => {
    const fetchImpl = makeFetch({ '0xBBB': { transaction: { timestamp: 2000 } } });
    const cache = new Map<string, number>([['0xAAA', 1000]]);
    const res = await fetchTransactionTimestamps(['0xAAA', '0xBBB'], { baseUrl: 'https://seed', fetchImpl, cache });
    expect(res.get('0xAAA')).toBe(1000); // from cache
    expect(res.get('0xBBB')).toBe(2000); // freshly fetched
    expect(fetchImpl).toHaveBeenCalledTimes(1); // only the uncached one
    expect(cache.get('0xBBB')).toBe(2000); // cache updated
  });

  it('omits failed lookups gracefully without throwing', async () => {
    const fetchImpl = makeFetch({
      '0xAAA': 'ERROR',
      '0xBBB': { transaction: { timestamp: 2000 } },
    });
    const res = await fetchTransactionTimestamps(['0xAAA', '0xBBB'], { baseUrl: 'https://seed', fetchImpl, cache: new Map() });
    expect(res.has('0xAAA')).toBe(false);
    expect(res.get('0xBBB')).toBe(2000);
  });
});
