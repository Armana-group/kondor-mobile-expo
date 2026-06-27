import {
  checkNetworkHealth,
  checkNetworkNodeHealth,
  summarizeNetworkHealth,
  type NetworkNodeHealth,
} from '../networkHealth';

function makeResponse({
  ok = true,
  status = 200,
  contentType = 'application/json',
  json,
}: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  json: unknown;
}): Response {
  return {
    ok,
    status,
    headers: {
      get: (name: string) => name.toLowerCase() === 'content-type' ? contentType : null,
    },
    json: jest.fn(async () => json),
  } as unknown as Response;
}

describe('networkHealth', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks a JSON-RPC head response as online', async () => {
    let now = 1_000;
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      now = 1_120;
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'chain.get_head_info',
        params: {},
      });
      return makeResponse({
        json: {
          result: {
            head_topology: { height: '12345' },
            last_irreversible_block: '12340',
            head_block_time: '1718910000',
          },
        },
      });
    });

    const health = await checkNetworkNodeHealth('https://rpc.example', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => now,
    });

    expect(health).toEqual(expect.objectContaining({
      url: 'https://rpc.example',
      status: 'online',
      latencyMs: 120,
      httpStatus: 200,
      height: 12345,
      libHeight: 12340,
      blockTime: 1718910000,
    }));
  });

  it('marks a slow but valid node as slow', async () => {
    let now = 5_000;
    const fetchImpl = jest.fn(async () => {
      now = 6_700;
      return makeResponse({
        json: { result: { head_topology: { height: 9 } } },
      });
    });

    const health = await checkNetworkNodeHealth('https://slow.example', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      slowMs: 1_500,
      now: () => now,
    });

    expect(health.status).toBe('slow');
    expect(health.latencyMs).toBe(1_700);
  });

  it('marks HTML responses as unavailable', async () => {
    const fetchImpl = jest.fn(async () => makeResponse({
      contentType: 'text/html',
      json: {},
    }));

    const health = await checkNetworkNodeHealth('https://html.example', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 10,
    });

    expect(health).toEqual(expect.objectContaining({
      status: 'unavailable',
      error: 'Received HTML instead of JSON',
      contentType: 'text/html',
    }));
  });

  it('marks JSON-RPC errors as unavailable', async () => {
    const fetchImpl = jest.fn(async () => makeResponse({
      json: { error: { message: 'method failed' } },
    }));

    const health = await checkNetworkNodeHealth('https://error.example', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 20,
    });

    expect(health).toEqual(expect.objectContaining({
      status: 'unavailable',
      error: 'method failed',
    }));
  });

  it('marks timed out nodes as unavailable', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    const fetchImpl = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    }));

    const pending = checkNetworkNodeHealth('https://timeout.example', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 50,
    });

    jest.advanceTimersByTime(50);

    await expect(pending).resolves.toEqual(expect.objectContaining({
      status: 'unavailable',
      error: 'Request timed out',
    }));
  });

  it('summarizes node health for online, degraded, and unavailable networks', () => {
    const onlineNode: NetworkNodeHealth = {
      url: 'https://online.example',
      status: 'online',
      checkedAt: 1,
      latencyMs: 100,
      height: 10,
    };
    const slowNode: NetworkNodeHealth = {
      url: 'https://slow.example',
      status: 'slow',
      checkedAt: 2,
      latencyMs: 2_000,
      height: 9,
    };
    const unavailableNode: NetworkNodeHealth = {
      url: 'https://down.example',
      status: 'unavailable',
      checkedAt: 3,
      latencyMs: null,
      error: 'Network request failed',
    };

    expect(summarizeNetworkHealth([onlineNode])).toEqual(expect.objectContaining({
      status: 'online',
      healthyCount: 1,
      totalCount: 1,
      bestHeight: 10,
    }));
    expect(summarizeNetworkHealth([onlineNode, slowNode])).toEqual(expect.objectContaining({
      status: 'degraded',
      healthyCount: 2,
      totalCount: 2,
      bestHeight: 10,
    }));
    expect(summarizeNetworkHealth([unavailableNode])).toEqual(expect.objectContaining({
      status: 'unavailable',
      healthyCount: 0,
      totalCount: 1,
    }));
  });

  it('checks unique non-empty urls', async () => {
    const fetchImpl = jest.fn(async () => makeResponse({
      json: { result: { head_topology: { height: 1 } } },
    }));

    const result = await checkNetworkHealth(['https://a.example', '', 'https://a.example'], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.summary.status).toBe('online');
  });
});
