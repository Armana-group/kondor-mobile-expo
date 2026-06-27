export type DAppOriginRiskLevel = 'trusted' | 'notice' | 'warning' | 'danger';

export interface DAppOriginSignal {
  id: string;
  level: Exclude<DAppOriginRiskLevel, 'trusted'>;
  title: string;
  detail: string;
}

export interface DAppOriginSecurity {
  origin: string;
  displayOrigin: string;
  hostname: string | null;
  siteName: string;
  level: DAppOriginRiskLevel;
  trusted: boolean;
  blocked: boolean;
  denyApproval: boolean;
  signals: DAppOriginSignal[];
}

export interface OriginSecurityOptions {
  highRiskRequest?: string;
}

export const TRUSTED_DAPP_HOSTS = [
  'fogata.io',
  'koindx.com',
  'kollection.app',
  'koinscan.com',
  'koinscan.io',
];

export const BLOCKED_DAPP_HOSTS: string[] = [];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const RISK_ORDER: Record<DAppOriginRiskLevel, number> = {
  trusted: 0,
  notice: 1,
  warning: 2,
  danger: 3,
};

export function isRiskEscalation(
  previous: DAppOriginRiskLevel,
  current: DAppOriginRiskLevel
): boolean {
  return RISK_ORDER[current] > RISK_ORDER[previous];
}

function normalizeOriginInput(origin: string): string {
  return origin.trim();
}

function parseOrigin(origin: string): URL | null {
  const normalized = normalizeOriginInput(origin);
  if (!normalized || normalized.toLowerCase() === 'unknown') {
    return null;
  }

  try {
    return new URL(normalized);
  } catch {
    try {
      return new URL(`https://${normalized}`);
    } catch {
      return null;
    }
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '');
}

function hostnameMatches(hostname: string, candidate: string): boolean {
  return hostname === candidate || hostname.endsWith(`.${candidate}`);
}

function getHostLabel(hostname: string): string {
  const parts = hostname.split('.').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : parts[0] || hostname;
}

function getHostTld(hostname: string): string {
  const parts = hostname.split('.').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function toConfusableSkeleton(value: string): string {
  return value
    .toLowerCase()
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 0; i < a.length; i += 1) {
    let last = i;
    previous[0] = i + 1;

    for (let j = 0; j < b.length; j += 1) {
      const old = previous[j + 1];
      previous[j + 1] = Math.min(
        previous[j + 1] + 1,
        previous[j] + 1,
        last + (a[i] === b[j] ? 0 : 1)
      );
      last = old;
    }
  }

  return previous[b.length];
}

function isPunycodeHostname(hostname: string): boolean {
  return hostname.split('.').some((label) => label.startsWith('xn--'));
}

function findTrustedLookalike(hostname: string): string | null {
  const hostLabel = getHostLabel(hostname);
  const hostSkeleton = toConfusableSkeleton(hostLabel);
  const hostTld = getHostTld(hostname);

  for (const trustedHost of TRUSTED_DAPP_HOSTS) {
    if (hostnameMatches(hostname, trustedHost)) {
      continue;
    }

    if (hostname.includes(trustedHost)) {
      return trustedHost;
    }

    const trustedLabel = getHostLabel(trustedHost);
    const trustedSkeleton = toConfusableSkeleton(trustedLabel);
    const sameTld = hostTld === getHostTld(trustedHost);
    const brandEmbedded = hostSkeleton.includes(trustedSkeleton);

    if (
      sameTld &&
      (brandEmbedded || levenshteinDistance(hostSkeleton, trustedSkeleton) <= 1)
    ) {
      return trustedHost;
    }
  }

  return null;
}

function displayNameForUrl(url: URL | null, fallback: string): string {
  if (!url) {
    return fallback || 'Unknown site';
  }

  const hostname = normalizeHostname(url.hostname);
  const trustedHost = TRUSTED_DAPP_HOSTS.find((host) => hostnameMatches(hostname, host));
  const label = getHostLabel(trustedHost || hostname);
  return label || fallback || 'Unknown site';
}

function getHighestRisk(
  signals: DAppOriginSignal[],
  trusted: boolean
): DAppOriginRiskLevel {
  if (signals.length === 0) {
    return trusted ? 'trusted' : 'notice';
  }

  return signals.reduce<DAppOriginRiskLevel>(
    (highest, signal) =>
      RISK_ORDER[signal.level] > RISK_ORDER[highest] ? signal.level : highest,
    trusted ? 'trusted' : 'notice'
  );
}

export function inspectDAppOrigin(
  origin: string,
  options: OriginSecurityOptions = {}
): DAppOriginSecurity {
  const normalized = normalizeOriginInput(origin);
  const url = parseOrigin(normalized);
  const hostname = url ? normalizeHostname(url.hostname) : null;
  const displayOrigin = url?.origin || normalized || 'Unknown site';
  const signals: DAppOriginSignal[] = [];

  if (!url || !hostname) {
    signals.push({
      id: 'invalid-origin',
      level: 'warning',
      title: 'Unverified origin',
      detail: 'Kondor could not verify which site made this request.',
    });

    return {
      origin,
      displayOrigin,
      hostname: null,
      siteName: 'Unknown site',
      level: 'warning',
      trusted: false,
      blocked: false,
      denyApproval: false,
      signals,
    };
  }

  const trusted = TRUSTED_DAPP_HOSTS.some((host) => hostnameMatches(hostname, host));
  const blocked = BLOCKED_DAPP_HOSTS.some((host) => hostnameMatches(hostname, host));
  const local = LOCAL_HOSTS.has(hostname);
  const lookalike = findTrustedLookalike(hostname);

  if (blocked) {
    signals.push({
      id: 'blocked-origin',
      level: 'danger',
      title: 'Blocked site',
      detail: "This origin is on Kondor's phishing denylist.",
    });
  }

  if (isPunycodeHostname(hostname)) {
    signals.push({
      id: 'punycode-origin',
      level: 'danger',
      title: 'Possible impersonation',
      detail: 'This domain uses punycode characters that can mimic another site.',
    });
  }

  if (lookalike) {
    signals.push({
      id: 'lookalike-origin',
      level: 'danger',
      title: 'Possible lookalike domain',
      detail: `This domain resembles ${lookalike} but is not an exact match.`,
    });
  }

  if (url.protocol === 'http:' && !local) {
    signals.push({
      id: 'insecure-origin',
      level: 'warning',
      title: 'Insecure connection',
      detail: 'This site is using HTTP, so the request could be intercepted or modified.',
    });
  } else if (!['https:', 'http:'].includes(url.protocol)) {
    signals.push({
      id: 'unsupported-origin',
      level: 'warning',
      title: 'Unusual origin',
      detail: `This request came from a ${url.protocol.replace(':', '')} origin.`,
    });
  }

  if (local && !trusted) {
    signals.push({
      id: 'local-origin',
      level: options.highRiskRequest ? 'warning' : 'notice',
      title: 'Local development site',
      detail: 'Only approve this request if you started the local app yourself.',
    });
  } else if (!trusted && !blocked && !lookalike && !isPunycodeHostname(hostname)) {
    signals.push({
      id: options.highRiskRequest ? 'untrusted-high-risk-origin' : 'untrusted-origin',
      level: options.highRiskRequest ? 'warning' : 'notice',
      title: options.highRiskRequest ? 'Unrecognized signing site' : 'Unrecognized site',
      detail: options.highRiskRequest
        ? `This ${options.highRiskRequest} request is from a site not in Kondor's known dApp list.`
        : "This site is not in Kondor's known dApp list.",
    });
  }

  const level = getHighestRisk(signals, trusted);

  return {
    origin,
    displayOrigin,
    hostname,
    siteName: displayNameForUrl(url, displayOrigin),
    level,
    trusted,
    blocked,
    denyApproval: blocked || level === 'danger',
    signals,
  };
}
