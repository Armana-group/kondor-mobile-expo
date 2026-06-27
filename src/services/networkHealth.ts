export type NetworkNodeStatus = 'online' | 'slow' | 'unavailable';
export type NetworkHealthStatus = 'online' | 'degraded' | 'unavailable';

export interface NetworkNodeHealth {
  url: string;
  status: NetworkNodeStatus;
  checkedAt: number;
  latencyMs: number | null;
  httpStatus?: number;
  contentType?: string;
  height?: number;
  libHeight?: number;
  blockTime?: number;
  error?: string;
}

export interface NetworkHealthSummary {
  status: NetworkHealthStatus;
  healthyCount: number;
  totalCount: number;
  title: string;
  detail: string;
  checkedAt?: number;
  bestHeight?: number;
}

interface HeadInfoResponse {
  result?: {
    head_topology?: {
      height?: string | number;
    };
    last_irreversible_block?: string | number;
    head_block_time?: string | number;
  };
  error?: {
    message?: string;
  };
}

interface CheckNodeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  slowMs?: number;
  now?: () => number;
}

function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function makeUnavailable(
  url: string,
  checkedAt: number,
  latencyMs: number | null,
  error: string,
  response?: Response
): NetworkNodeHealth {
  return {
    url,
    status: 'unavailable',
    checkedAt,
    latencyMs,
    httpStatus: response?.status,
    contentType: response?.headers.get('content-type') ?? undefined,
    error,
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { name?: unknown }).name === 'AbortError';
}

export async function checkNetworkNodeHealth(
  url: string,
  options: CheckNodeOptions = {}
): Promise<NetworkNodeHealth> {
  const {
    fetchImpl = fetch,
    timeoutMs = 5_000,
    slowMs = 1_500,
    now = () => Date.now(),
  } = options;
  const startedAt = now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'chain.get_head_info',
        params: {},
      }),
      signal: controller.signal,
    });
    const finishedAt = now();
    const latencyMs = Math.max(0, finishedAt - startedAt);
    const contentType = response.headers.get('content-type') ?? '';
    const checkedAt = finishedAt;

    if (contentType.includes('text/html')) {
      return makeUnavailable(url, checkedAt, latencyMs, 'Received HTML instead of JSON', response);
    }

    if (!contentType.includes('application/json')) {
      return makeUnavailable(url, checkedAt, latencyMs, 'Received non-JSON response', response);
    }

    const json = await response.json() as HeadInfoResponse;
    if (!response.ok) {
      return makeUnavailable(url, checkedAt, latencyMs, `HTTP ${response.status}`, response);
    }
    if (json.error) {
      return makeUnavailable(url, checkedAt, latencyMs, json.error.message || 'JSON-RPC error', response);
    }

    const height = toNumber(json.result?.head_topology?.height);
    const libHeight = toNumber(json.result?.last_irreversible_block);
    const blockTime = toNumber(json.result?.head_block_time);

    if (height === undefined) {
      return makeUnavailable(url, checkedAt, latencyMs, 'RPC response missing head height', response);
    }

    return {
      url,
      status: latencyMs >= slowMs ? 'slow' : 'online',
      checkedAt,
      latencyMs,
      httpStatus: response.status,
      contentType,
      height,
      libHeight,
      blockTime,
    };
  } catch (error) {
    const checkedAt = now();
    const latencyMs = Math.max(0, checkedAt - startedAt);
    const message = isAbortError(error)
      ? 'Request timed out'
      : error instanceof Error
        ? error.message
        : 'Network request failed';

    return makeUnavailable(url, checkedAt, latencyMs, message);
  } finally {
    clearTimeout(timeout);
  }
}

export function summarizeNetworkHealth(nodes: NetworkNodeHealth[]): NetworkHealthSummary {
  const totalCount = nodes.length;
  const healthyNodes = nodes.filter((node) => node.status === 'online' || node.status === 'slow');
  const healthyCount = healthyNodes.length;
  const checkedAt = nodes.reduce<number | undefined>(
    (latest, node) => latest === undefined ? node.checkedAt : Math.max(latest, node.checkedAt),
    undefined
  );
  const bestHeight = healthyNodes.reduce<number | undefined>(
    (height, node) => node.height === undefined ? height : Math.max(height ?? 0, node.height),
    undefined
  );

  if (totalCount === 0) {
    return {
      status: 'unavailable',
      healthyCount,
      totalCount,
      checkedAt,
      bestHeight,
      title: 'No nodes configured',
      detail: 'Kondor has no network nodes to check.',
    };
  }

  if (healthyCount === 0) {
    return {
      status: 'unavailable',
      healthyCount,
      totalCount,
      checkedAt,
      bestHeight,
      title: 'Network unavailable',
      detail: 'Kondor cannot reach this Koinos network right now.',
    };
  }

  if (healthyCount < totalCount || healthyNodes.some((node) => node.status === 'slow')) {
    return {
      status: 'degraded',
      healthyCount,
      totalCount,
      checkedAt,
      bestHeight,
      title: 'Network is reachable',
      detail: 'Some network nodes are slow or unavailable.',
    };
  }

  return {
    status: 'online',
    healthyCount,
    totalCount,
    checkedAt,
    bestHeight,
    title: 'Network online',
    detail: 'Kondor can reach this Koinos network.',
  };
}

export async function checkNetworkHealth(
  urls: string[],
  options: CheckNodeOptions = {}
): Promise<{ nodes: NetworkNodeHealth[]; summary: NetworkHealthSummary }> {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  const nodes = await Promise.all(uniqueUrls.map((url) => checkNetworkNodeHealth(url, options)));
  return {
    nodes,
    summary: summarizeNetworkHealth(nodes),
  };
}
