import { KONDOR_PROVIDER_SCRIPT, BACKGROUND_COMMANDS, APPROVAL_COMMANDS } from '../kondorProvider';

describe('BACKGROUND_COMMANDS', () => {
  it('contains provider read-only commands', () => {
    expect(BACKGROUND_COMMANDS).toContain('provider:call');
    expect(BACKGROUND_COMMANDS).toContain('provider:getHeadInfo');
    expect(BACKGROUND_COMMANDS).toContain('provider:readContract');
    expect(BACKGROUND_COMMANDS).toContain('provider:getChainId');
  });

  it('contains signer:prepareTransaction (non-signing)', () => {
    expect(BACKGROUND_COMMANDS).toContain('signer:prepareTransaction');
  });

  it('does NOT contain signing commands', () => {
    expect(BACKGROUND_COMMANDS).not.toContain('signer:signTransaction');
    expect(BACKGROUND_COMMANDS).not.toContain('signer:signHash');
    expect(BACKGROUND_COMMANDS).not.toContain('signer:signMessage');
    expect(BACKGROUND_COMMANDS).not.toContain('signer:sendTransaction');
  });

  it('does NOT contain getAccounts', () => {
    expect(BACKGROUND_COMMANDS).not.toContain('getAccounts');
  });

  it('does NOT contain transaction broadcast commands (security fix #3)', () => {
    expect(BACKGROUND_COMMANDS).not.toContain('provider:sendTransaction');
    expect(BACKGROUND_COMMANDS).not.toContain('provider:submitBlock');
  });
});

describe('APPROVAL_COMMANDS', () => {
  it('contains getAccounts', () => {
    expect(APPROVAL_COMMANDS).toContain('getAccounts');
  });

  it('contains all signing commands', () => {
    expect(APPROVAL_COMMANDS).toContain('signer:signHash');
    expect(APPROVAL_COMMANDS).toContain('signer:signMessage');
    expect(APPROVAL_COMMANDS).toContain('signer:signTransaction');
    expect(APPROVAL_COMMANDS).toContain('signer:sendTransaction');
  });

  it('contains transaction broadcast commands (security fix #3)', () => {
    expect(APPROVAL_COMMANDS).toContain('provider:sendTransaction');
    expect(APPROVAL_COMMANDS).toContain('provider:submitBlock');
  });
});

describe('KONDOR_PROVIDER_SCRIPT security', () => {
  it('uses crypto.getRandomValues for UUID generation (not Math.random)', () => {
    expect(KONDOR_PROVIDER_SCRIPT).toContain('crypto.getRandomValues');
    expect(KONDOR_PROVIDER_SCRIPT).not.toContain('Math.random');
  });

  it('does not use wildcard postMessage origin', () => {
    // The injected script should not post messages with wildcard origin
    expect(KONDOR_PROVIDER_SCRIPT).not.toMatch(/postMessage\([^)]*,\s*['"][*]['"]\)/);
  });

  it('uses _log helper instead of direct console.log for conditional logging', () => {
    // Should define a _log function that checks __DEV__
    expect(KONDOR_PROVIDER_SCRIPT).toContain('function _log()');
    expect(KONDOR_PROVIDER_SCRIPT).toContain('if (__DEV__)');
    // Should not have any direct console.log calls (only inside _log)
    const lines = KONDOR_PROVIDER_SCRIPT.split('\n');
    const directConsoleLogs = lines.filter(
      (line) => line.includes('console.log') && !line.includes('function _log')
    );
    expect(directConsoleLogs).toHaveLength(0);
  });

  it('forwards explicit getProvider network arguments to native provider commands', () => {
    expect(KONDOR_PROVIDER_SCRIPT).toContain('function createProvider(network)');
    expect(KONDOR_PROVIDER_SCRIPT).toContain('const provider = createProvider();');
    expect(KONDOR_PROVIDER_SCRIPT).toContain('return createProvider(network);');
    expect(KONDOR_PROVIDER_SCRIPT).toContain("sendToNative('provider:call', { network: network, method, params })");
    expect(KONDOR_PROVIDER_SCRIPT).toContain("sendToNative('provider:getChainId', { network: network })");
    expect(KONDOR_PROVIDER_SCRIPT).toContain("sendToNative('provider:getHeadInfo', { network: network })");
  });
});

describe('command array integrity', () => {
  it('has no overlap between BACKGROUND and APPROVAL commands', () => {
    const overlap = BACKGROUND_COMMANDS.filter((cmd) =>
      APPROVAL_COMMANDS.includes(cmd)
    );
    expect(overlap).toEqual([]);
  });

  it('has no duplicate entries in BACKGROUND_COMMANDS', () => {
    const unique = new Set(BACKGROUND_COMMANDS);
    expect(unique.size).toBe(BACKGROUND_COMMANDS.length);
  });

  it('has no duplicate entries in APPROVAL_COMMANDS', () => {
    const unique = new Set(APPROVAL_COMMANDS);
    expect(unique.size).toBe(APPROVAL_COMMANDS.length);
  });
});
