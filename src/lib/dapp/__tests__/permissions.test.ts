import { inspectDAppOrigin } from '../originSecurity';
import {
  EMPTY_PERMISSION_STORE,
  addGrant,
  createGrant,
  isValidGrant,
  normalizeGrantOrigin,
  removeGrant,
  resolveConnection,
  type DAppPermissionGrant,
  type DAppPermissionStore,
} from '../permissions';

const NOW = 1_750_000_000_000;
const ORIGIN = 'https://example.com';
const WALLET_ADDRESSES = ['1walletAddrA', '1walletAddrB'];

function makeGrant(overrides: Partial<DAppPermissionGrant> = {}): DAppPermissionGrant {
  return {
    version: 1,
    origin: ORIGIN,
    hostname: 'example.com',
    accounts: ['1walletAddrA'],
    capabilities: [{ method: 'getAccounts', caveats: [] }],
    lifetime: 'persistent',
    riskAtGrant: 'notice',
    createdAt: NOW - 1000,
    lastUsedAt: NOW - 1000,
    ...overrides,
  };
}

function storeWith(grant: DAppPermissionGrant): DAppPermissionStore {
  return { version: 1, grants: { [grant.origin]: grant } };
}

describe('normalizeGrantOrigin', () => {
  it('normalizes a URL origin', () => {
    expect(normalizeGrantOrigin('https://Example.com/path')).toBe('https://example.com');
  });

  it('returns null for unparseable input', () => {
    expect(normalizeGrantOrigin('')).toBeNull();
    expect(normalizeGrantOrigin('not a url at all %%%')).toBeNull();
  });
});

describe('createGrant', () => {
  it('creates a grant from an approved connection', () => {
    const security = inspectDAppOrigin(ORIGIN);
    const grant = createGrant({
      origin: ORIGIN,
      accounts: ['1walletAddrA'],
      lifetime: 'persistent',
      security,
      now: NOW,
    });

    expect(grant).not.toBeNull();
    expect(grant?.origin).toBe('https://example.com');
    expect(grant?.hostname).toBe('example.com');
    expect(grant?.capabilities).toEqual([{ method: 'getAccounts', caveats: [] }]);
    expect(grant?.riskAtGrant).toBe(security.level);
    expect(grant?.createdAt).toBe(NOW);
  });

  it('refuses to create a grant for a deny-approval origin', () => {
    const evil = 'https://xn--koindx-9va.com';
    const security = inspectDAppOrigin(evil);

    expect(security.denyApproval).toBe(true);
    expect(
      createGrant({
        origin: evil,
        accounts: ['1walletAddrA'],
        lifetime: 'persistent',
        security,
        now: NOW,
      })
    ).toBeNull();
  });

  it('refuses to create a grant with no accounts', () => {
    const security = inspectDAppOrigin(ORIGIN);

    expect(
      createGrant({
        origin: ORIGIN,
        accounts: [],
        lifetime: 'persistent',
        security,
        now: NOW,
      })
    ).toBeNull();
  });
});

describe('isValidGrant fail-closed validation', () => {
  it('accepts a well-formed v1 grant', () => {
    expect(isValidGrant(makeGrant())).toBe(true);
  });

  it('rejects records naming any method other than getAccounts', () => {
    const forged = makeGrant({
      capabilities: [{ method: 'signer:signTransaction' as never, caveats: [] }],
    });

    expect(isValidGrant(forged)).toBe(false);
  });

  it('rejects unknown versions, missing fields, and non-string accounts', () => {
    expect(isValidGrant({ ...makeGrant(), version: 2 })).toBe(false);
    expect(isValidGrant({ ...makeGrant(), accounts: [42 as never] })).toBe(false);
    expect(isValidGrant({ ...makeGrant(), capabilities: [] })).toBe(false);
    expect(isValidGrant(null)).toBe(false);
    expect(isValidGrant('grant')).toBe(false);
  });
});

describe('addGrant and removeGrant', () => {
  it('adds and removes grants immutably, keyed by origin', () => {
    const grant = makeGrant();
    const added = addGrant(EMPTY_PERMISSION_STORE, grant);

    expect(added.grants[ORIGIN]).toEqual(grant);
    expect(EMPTY_PERMISSION_STORE.grants[ORIGIN]).toBeUndefined();

    const removed = removeGrant(added, ORIGIN);
    expect(removed.grants[ORIGIN]).toBeUndefined();
    expect(added.grants[ORIGIN]).toEqual(grant);
  });
});

describe('normalizeGrantOrigin opaque and non-web origins', () => {
  it('rejects non-web schemes whose URL.origin collapses to null', () => {
    expect(normalizeGrantOrigin('foo://attacker-app/')).toBeNull();
    expect(normalizeGrantOrigin('file:///etc/passwd')).toBeNull();
    expect(normalizeGrantOrigin('data:text/html,x')).toBeNull();
    expect(normalizeGrantOrigin('chrome-extension://abcdefgh/')).toBeNull();
  });

  it('does not resolve a forged null-key grant for another opaque origin', () => {
    const security = inspectDAppOrigin('foo://attacker-app/');
    const grant = createGrant({
      origin: 'foo://attacker-app/',
      accounts: ['1walletAddrA'],
      lifetime: 'persistent',
      security,
      now: NOW,
    });

    expect(grant).toBeNull();

    const forgedStore = {
      version: 1,
      grants: { null: makeGrant({ origin: 'null', hostname: 'null' }) },
    } as unknown as DAppPermissionStore;

    const result = resolveConnection('bar://other-app/', forgedStore, WALLET_ADDRESSES, NOW);
    expect(result.canAutoConnect).toBe(false);
  });
});

describe('addGrant and removeGrant normalized keying', () => {
  it('removeGrant revokes via any equivalent origin spelling', () => {
    const added = addGrant(EMPTY_PERMISSION_STORE, makeGrant());
    const removed = removeGrant(added, 'https://Example.com/');

    expect(removed.grants['https://example.com']).toBeUndefined();
  });

  it('addGrant refuses an un-normalizable grant origin', () => {
    const bogus = makeGrant({ origin: 'foo://opaque/' });

    expect(addGrant(EMPTY_PERMISSION_STORE, bogus)).toEqual(EMPTY_PERMISSION_STORE);
  });
});

describe('createGrant origin and security consistency', () => {
  it('refuses a grant when the security inspection is for a different origin', () => {
    const security = inspectDAppOrigin('https://other-site.com');

    expect(
      createGrant({
        origin: ORIGIN,
        accounts: ['1walletAddrA'],
        lifetime: 'persistent',
        security,
        now: NOW,
      })
    ).toBeNull();
  });
});

describe('resolveConnection truth table', () => {
  it('returns no-grant when no stored grant exists', () => {
    const result = resolveConnection(ORIGIN, EMPTY_PERMISSION_STORE, WALLET_ADDRESSES, NOW);

    expect(result.canAutoConnect).toBe(false);
    expect(result.reason).toBe('no-grant');
  });

  it('returns accounts for a live grant on a safe origin', () => {
    const result = resolveConnection(ORIGIN, storeWith(makeGrant()), WALLET_ADDRESSES, NOW);

    expect(result.canAutoConnect).toBe(true);
    expect(result.accounts).toEqual(['1walletAddrA']);
  });

  it('denies an approval-blocked origin even with a stored grant', () => {
    const evil = 'https://xn--koindx-9va.com';
    const grant = makeGrant({
      origin: evil,
      hostname: 'xn--koindx-9va.com',
      riskAtGrant: 'danger',
    });

    const result = resolveConnection(evil, storeWith(grant), WALLET_ADDRESSES, NOW);
    expect(result.canAutoConnect).toBe(false);
    expect(result.reason).toBe('deny-approval');
  });

  it('suspends a grant when origin risk escalates', () => {
    const grant = makeGrant({ riskAtGrant: 'trusted' });
    const result = resolveConnection(ORIGIN, storeWith(grant), WALLET_ADDRESSES, NOW);

    expect(result.canAutoConnect).toBe(false);
    expect(result.reason).toBe('risk-escalated');
  });

  it('fails closed for malformed grants', () => {
    const store = {
      version: 1,
      grants: {
        [ORIGIN]: makeGrant({
          capabilities: [{ method: 'signer:signMessage' as never, caveats: [] }],
        }),
      },
    } as DAppPermissionStore;

    const result = resolveConnection(ORIGIN, store, WALLET_ADDRESSES, NOW);
    expect(result.canAutoConnect).toBe(false);
    expect(result.reason).toBe('malformed');
  });

  it('rejects expired grants', () => {
    const grant = makeGrant({ expiresAt: NOW - 1 });
    const result = resolveConnection(ORIGIN, storeWith(grant), WALLET_ADDRESSES, NOW);

    expect(result.canAutoConnect).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('prunes removed accounts and rejects fully stale grants', () => {
    const partial = makeGrant({ accounts: ['1walletAddrA', '1removedAddr'] });
    const pruned = resolveConnection(ORIGIN, storeWith(partial), WALLET_ADDRESSES, NOW);

    expect(pruned.canAutoConnect).toBe(true);
    expect(pruned.accounts).toEqual(['1walletAddrA']);

    const allGone = makeGrant({ accounts: ['1removedAddr'] });
    const stale = resolveConnection(ORIGIN, storeWith(allGone), WALLET_ADDRESSES, NOW);

    expect(stale.canAutoConnect).toBe(false);
    expect(stale.reason).toBe('accounts-stale');
  });

  it('returns no-grant for an unparseable request origin', () => {
    const result = resolveConnection('Unknown', storeWith(makeGrant()), WALLET_ADDRESSES, NOW);

    expect(result.canAutoConnect).toBe(false);
    expect(result.reason).toBe('no-grant');
  });

  it('does not mutate the store during account pruning', () => {
    const grant = makeGrant({ accounts: ['1walletAddrA', '1removedAddr'] });
    const store = storeWith(grant);
    const before = JSON.parse(JSON.stringify(store));

    resolveConnection(ORIGIN, store, WALLET_ADDRESSES, NOW);

    expect(store).toEqual(before);
  });

  it('rejects a record whose stored origin disagrees with its store key', () => {
    const forged = { ...makeGrant(), origin: 'https://evil.com' };
    const store = { version: 1, grants: { [ORIGIN]: forged } } as DAppPermissionStore;
    const result = resolveConnection(ORIGIN, store, WALLET_ADDRESSES, NOW);

    expect(result.canAutoConnect).toBe(false);
    expect(result.reason).toBe('malformed');
  });
});
