import { inspectDAppOrigin, isRiskEscalation } from '../originSecurity';

describe('dApp origin security', () => {
  it('trusts known dApp hosts and their subdomains', () => {
    expect(inspectDAppOrigin('https://fogata.io')).toMatchObject({
      hostname: 'fogata.io',
      siteName: 'fogata',
      level: 'trusted',
      trusted: true,
      signals: [],
    });

    expect(inspectDAppOrigin('https://app.koindx.com')).toMatchObject({
      hostname: 'app.koindx.com',
      siteName: 'koindx',
      level: 'trusted',
      trusted: true,
    });
  });

  it('adds a notice for unrecognized connection sites', () => {
    const security = inspectDAppOrigin('https://example.com');

    expect(security).toMatchObject({
      level: 'notice',
      trusted: false,
    });
    expect(security.signals).toContainEqual(
      expect.objectContaining({
        id: 'untrusted-origin',
        level: 'notice',
      })
    );
  });

  it('warns when an unrecognized site asks for signing', () => {
    const security = inspectDAppOrigin('https://example.com', {
      highRiskRequest: 'message signing',
    });

    expect(security.level).toBe('warning');
    expect(security.signals).toContainEqual(
      expect.objectContaining({
        id: 'untrusted-high-risk-origin',
        level: 'warning',
        detail: expect.stringContaining('message signing'),
      })
    );
  });

  it('warns for insecure web origins outside local development', () => {
    const security = inspectDAppOrigin('http://example.com');

    expect(security.level).toBe('warning');
    expect(security.signals).toContainEqual(
      expect.objectContaining({
        id: 'insecure-origin',
        level: 'warning',
      })
    );
  });

  it('flags punycode domains as possible impersonation', () => {
    const security = inspectDAppOrigin('https://xn--fogata-9ua.io');

    expect(security.level).toBe('danger');
    expect(security.signals).toContainEqual(
      expect.objectContaining({
        id: 'punycode-origin',
        level: 'danger',
      })
    );
  });

  it('flags trusted-domain lookalikes', () => {
    expect(inspectDAppOrigin('https://fogata.io.evil.test')).toMatchObject({
      level: 'danger',
      trusted: false,
    });

    const confusable = inspectDAppOrigin('https://f0gata.io');

    expect(confusable.level).toBe('danger');
    expect(confusable.signals).toContainEqual(
      expect.objectContaining({
        id: 'lookalike-origin',
        detail: expect.stringContaining('fogata.io'),
      })
    );
  });

  it('warns when the request origin cannot be verified', () => {
    const security = inspectDAppOrigin('Unknown');

    expect(security).toMatchObject({
      hostname: null,
      level: 'warning',
      siteName: 'Unknown site',
    });
    expect(security.signals).toContainEqual(
      expect.objectContaining({
        id: 'invalid-origin',
      })
    );
  });

  describe('denyApproval gate', () => {
    it('denies approval for punycode and lookalike danger origins', () => {
      expect(inspectDAppOrigin('https://xn--fogata-9ua.io').denyApproval).toBe(true);
      expect(inspectDAppOrigin('https://f0gata.io').denyApproval).toBe(true);
      expect(inspectDAppOrigin('https://fogata.io.evil.test').denyApproval).toBe(true);
    });

    it('does not deny approval for trusted, unrecognized, or merely insecure origins', () => {
      expect(inspectDAppOrigin('https://fogata.io').denyApproval).toBe(false);
      expect(inspectDAppOrigin('https://example.com').denyApproval).toBe(false);
      expect(
        inspectDAppOrigin('https://example.com', { highRiskRequest: 'signing' }).denyApproval
      ).toBe(false);
      expect(inspectDAppOrigin('http://example.com').denyApproval).toBe(false);
      expect(inspectDAppOrigin('Unknown').denyApproval).toBe(false);
    });
  });
});

describe('isRiskEscalation', () => {
  it('reports escalation when current risk exceeds the recorded risk', () => {
    expect(isRiskEscalation('notice', 'warning')).toBe(true);
    expect(isRiskEscalation('notice', 'danger')).toBe(true);
    expect(isRiskEscalation('trusted', 'notice')).toBe(true);
  });

  it('does not report escalation for equal or lower risk', () => {
    expect(isRiskEscalation('notice', 'notice')).toBe(false);
    expect(isRiskEscalation('warning', 'notice')).toBe(false);
    expect(isRiskEscalation('danger', 'trusted')).toBe(false);
  });
});
