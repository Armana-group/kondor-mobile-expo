import {
  inspectDAppOrigin,
  isRiskEscalation,
  type DAppOriginRiskLevel,
  type DAppOriginSecurity,
} from './originSecurity';

export const GRANT_SCHEMA_VERSION = 1;

export type GrantableMethod = 'getAccounts';

export interface GrantCaveat {
  type: string;
  value: unknown;
}

export interface GrantedCapability {
  method: GrantableMethod;
  caveats: GrantCaveat[];
}

export type GrantLifetime = 'persistent' | 'session';

export interface DAppPermissionGrant {
  version: typeof GRANT_SCHEMA_VERSION;
  origin: string;
  hostname: string;
  accounts: string[];
  capabilities: GrantedCapability[];
  lifetime: GrantLifetime;
  riskAtGrant: DAppOriginRiskLevel;
  createdAt: number;
  lastUsedAt: number;
  expiresAt?: number;
  integrity?: string;
}

export interface DAppPermissionStore {
  version: typeof GRANT_SCHEMA_VERSION;
  grants: Record<string, DAppPermissionGrant>;
}

export const EMPTY_PERMISSION_STORE: DAppPermissionStore = {
  version: GRANT_SCHEMA_VERSION,
  grants: {},
};

export type ConnectionDenialReason =
  | 'no-grant'
  | 'deny-approval'
  | 'risk-escalated'
  | 'expired'
  | 'malformed'
  | 'accounts-stale';

export interface ConnectionResolution {
  canAutoConnect: boolean;
  accounts: string[];
  reason?: ConnectionDenialReason;
}

const VALID_RISK_LEVELS: DAppOriginRiskLevel[] = ['trusted', 'notice', 'warning', 'danger'];

export function normalizeGrantOrigin(origin: string): string | null {
  const trimmed = origin?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    if (url.origin === 'null') {
      return null;
    }
    if (!url.hostname) {
      return null;
    }
    const normalizedHostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const normalizedPort = url.port ? `:${url.port}` : '';
    return `${url.protocol}//${normalizedHostname}${normalizedPort}`;
  } catch {
    return null;
  }
}

export function isValidGrant(value: unknown): value is DAppPermissionGrant {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const grant = value as Record<string, unknown>;

  if (grant.version !== GRANT_SCHEMA_VERSION) return false;
  if (typeof grant.origin !== 'string' || !grant.origin) return false;
  if (typeof grant.hostname !== 'string' || !grant.hostname) return false;
  if (typeof grant.createdAt !== 'number' || typeof grant.lastUsedAt !== 'number') return false;
  if (grant.lifetime !== 'persistent' && grant.lifetime !== 'session') return false;
  if (!VALID_RISK_LEVELS.includes(grant.riskAtGrant as DAppOriginRiskLevel)) return false;

  if (!Array.isArray(grant.accounts) || grant.accounts.length === 0) return false;
  if (!grant.accounts.every((account) => typeof account === 'string' && account.length > 0)) {
    return false;
  }

  if (!Array.isArray(grant.capabilities) || grant.capabilities.length === 0) return false;
  const capabilitiesValid = grant.capabilities.every((capability) => {
    if (typeof capability !== 'object' || capability === null) {
      return false;
    }
    const candidate = capability as Record<string, unknown>;
    return candidate.method === 'getAccounts' && Array.isArray(candidate.caveats);
  });

  return capabilitiesValid;
}

export function createGrant(params: {
  origin: string;
  accounts: string[];
  lifetime: GrantLifetime;
  security: DAppOriginSecurity;
  now: number;
}): DAppPermissionGrant | null {
  const { origin, accounts, lifetime, security, now } = params;

  if (security.denyApproval || accounts.length === 0) {
    return null;
  }

  const normalized = normalizeGrantOrigin(origin);
  if (!normalized || !security.hostname) {
    return null;
  }

  const securityNormalized = normalizeGrantOrigin(security.origin);
  if (securityNormalized !== normalized) {
    return null;
  }

  return {
    version: GRANT_SCHEMA_VERSION,
    origin: normalized,
    hostname: security.hostname,
    accounts: [...accounts],
    capabilities: [{ method: 'getAccounts', caveats: [] }],
    lifetime,
    riskAtGrant: security.level,
    createdAt: now,
    lastUsedAt: now,
  };
}

export function addGrant(
  store: DAppPermissionStore,
  grant: DAppPermissionGrant
): DAppPermissionStore {
  const key = normalizeGrantOrigin(grant.origin);
  if (!key) {
    return store;
  }

  return {
    version: GRANT_SCHEMA_VERSION,
    grants: { ...store.grants, [key]: { ...grant, origin: key } },
  };
}

export function removeGrant(store: DAppPermissionStore, origin: string): DAppPermissionStore {
  const normalized = normalizeGrantOrigin(origin);
  const { [origin]: _raw, ...restWithoutRaw } = store.grants;
  const rest =
    normalized && normalized !== origin
      ? (({ [normalized]: _normalized, ...remaining }) => remaining)(restWithoutRaw)
      : restWithoutRaw;

  return { version: GRANT_SCHEMA_VERSION, grants: rest };
}

export function resolveConnection(
  origin: string,
  store: DAppPermissionStore | undefined,
  availableAccounts: string[],
  now: number
): ConnectionResolution {
  const denied = (reason: ConnectionDenialReason): ConnectionResolution => ({
    canAutoConnect: false,
    accounts: [],
    reason,
  });

  const normalized = normalizeGrantOrigin(origin);
  if (!normalized) {
    return denied('no-grant');
  }

  const grant = store?.grants?.[normalized];
  if (!grant) {
    return denied('no-grant');
  }
  if (!isValidGrant(grant)) {
    return denied('malformed');
  }
  if (normalizeGrantOrigin(grant.origin) !== normalized) {
    return denied('malformed');
  }

  const security = inspectDAppOrigin(origin);
  if (security.denyApproval) {
    return denied('deny-approval');
  }
  if (isRiskEscalation(grant.riskAtGrant, security.level)) {
    return denied('risk-escalated');
  }
  if (typeof grant.expiresAt === 'number' && now > grant.expiresAt) {
    return denied('expired');
  }

  const liveAccounts = grant.accounts.filter((account) => availableAccounts.includes(account));
  if (liveAccounts.length === 0) {
    return denied('accounts-stale');
  }

  return {
    canAutoConnect: true,
    accounts: liveAccounts,
  };
}
