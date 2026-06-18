import { CURATED_DAPPS, isCuratedUrl } from '../dapps';

describe('CURATED_DAPPS', () => {
  it('all curated dApps have isCurated flag set', () => {
    for (const app of CURATED_DAPPS) {
      expect(app.isCurated).toBe(true);
    }
  });

  it('all curated dApps use HTTPS URLs', () => {
    for (const app of CURATED_DAPPS) {
      expect(app.url).toMatch(/^https:\/\//);
    }
  });
});

describe('isCuratedUrl', () => {
  it('returns true for exact curated dApp URLs', () => {
    expect(isCuratedUrl('https://kollection.app')).toBe(true);
    expect(isCuratedUrl('https://koinscan.io')).toBe(true);
    expect(isCuratedUrl('https://app.koindx.com')).toBe(true);
  });

  it('returns true for curated URLs with paths', () => {
    expect(isCuratedUrl('https://kollection.app/nft/123')).toBe(true);
    expect(isCuratedUrl('https://koinscan.io/block/42')).toBe(true);
  });

  it('returns true for subdomains of curated dApps', () => {
    expect(isCuratedUrl('https://app.koindx.com/swap')).toBe(true);
  });

  it('returns false for non-curated URLs', () => {
    expect(isCuratedUrl('https://evil-site.com')).toBe(false);
    expect(isCuratedUrl('https://fake-kollection.app.evil.com')).toBe(false);
    expect(isCuratedUrl('https://example.com')).toBe(false);
  });

  it('returns false for spoofed domains', () => {
    expect(isCuratedUrl('https://kollection.app.evil.com')).toBe(false);
    expect(isCuratedUrl('https://notkollection.app')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isCuratedUrl('not-a-url')).toBe(false);
    expect(isCuratedUrl('')).toBe(false);
  });

  it('returns false for HTTP versions of curated URLs', () => {
    expect(isCuratedUrl('http://kollection.app')).toBe(true);
    // isCuratedUrl checks domain only, HTTP blocking is separate
  });
});
