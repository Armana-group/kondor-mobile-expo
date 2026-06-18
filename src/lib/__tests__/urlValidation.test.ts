import { validateDAppUrl, isSecureUrl } from '../urlValidation';

describe('validateDAppUrl', () => {
  it('returns null for empty input', () => {
    expect(validateDAppUrl('')).toBeNull();
    expect(validateDAppUrl('  ')).toBeNull();
  });

  it('returns null for invalid URLs', () => {
    expect(validateDAppUrl('not a url !!!')).toBeNull();
  });

  it('auto-prefixes HTTPS for bare domains', () => {
    const result = validateDAppUrl('kollection.app');
    expect(result).toEqual({ url: 'https://kollection.app' });
  });

  it('accepts valid HTTPS URLs', () => {
    const result = validateDAppUrl('https://kollection.app/nft');
    expect(result).toEqual({ url: 'https://kollection.app/nft' });
  });

  it('blocks HTTP URLs with error message', () => {
    const result = validateDAppUrl('http://evil.com');
    expect(result).not.toBeNull();
    expect(result!.error).toContain('HTTP connections are not allowed');
  });

  it('blocks explicit HTTP even for known domains', () => {
    const result = validateDAppUrl('http://kollection.app');
    expect(result!.error).toBeDefined();
  });

  it('trims whitespace', () => {
    const result = validateDAppUrl('  https://example.com  ');
    expect(result).toEqual({ url: 'https://example.com' });
  });
});

describe('isSecureUrl', () => {
  it('returns true for HTTPS', () => {
    expect(isSecureUrl('https://example.com')).toBe(true);
  });

  it('returns false for HTTP', () => {
    expect(isSecureUrl('http://example.com')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isSecureUrl('not-a-url')).toBe(false);
    expect(isSecureUrl('')).toBe(false);
  });
});
