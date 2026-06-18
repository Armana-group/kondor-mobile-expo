import {
  isValidAddress,
  truncateAddress,
  formatKoinBalance,
  formatCurrency,
  compactString,
  calculateManaRegenTime,
} from '../utils';

describe('isValidAddress', () => {
  it('accepts a valid 34-char base58 address', () => {
    expect(isValidAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true);
  });

  it('accepts a valid 33-char address', () => {
    expect(isValidAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidAddress('')).toBe(false);
  });

  it('rejects address with invalid base58 chars (0, O, I, l)', () => {
    expect(isValidAddress('0OIl' + 'A'.repeat(30))).toBe(false);
  });

  it('rejects address that is too short', () => {
    expect(isValidAddress('1A1zP1')).toBe(false);
  });

  it('rejects address that is too long', () => {
    expect(isValidAddress('1' + 'A'.repeat(35))).toBe(false);
  });
});

describe('truncateAddress', () => {
  const addr = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

  it('truncates with default length (6 start, 4 end)', () => {
    expect(truncateAddress(addr)).toBe('1A1zP1...vfNa');
  });

  it('truncates with custom start length', () => {
    expect(truncateAddress(addr, 4)).toBe('1A1z...vfNa');
  });

  it('returns empty string for empty input', () => {
    expect(truncateAddress('')).toBe('');
  });
});

describe('formatKoinBalance', () => {
  it('formats a whole number balance', () => {
    expect(formatKoinBalance('100')).toBe('100.00');
  });

  it('formats a decimal balance to 2 places', () => {
    expect(formatKoinBalance('1.23456789')).toBe('1.23');
  });

  it('returns "0.00" for empty input', () => {
    expect(formatKoinBalance('')).toBe('0.00');
  });

  it('formats zero', () => {
    expect(formatKoinBalance('0')).toBe('0.00');
  });
});

describe('formatCurrency', () => {
  it('formats a simple number', () => {
    expect(formatCurrency(1234.56)).toBe('1,234.56');
  });

  it('formats with custom significant digits', () => {
    expect(formatCurrency(1234.5678, 4)).toBe('1,235');
  });
});

describe('compactString', () => {
  it('compacts a long string', () => {
    expect(compactString('abcdefghij', 3)).toBe('abc...hij');
  });

  it('returns short strings unchanged', () => {
    expect(compactString('abcd', 3)).toBe('abcd');
  });

  it('returns empty string for empty input', () => {
    expect(compactString('', 3)).toBe('');
  });
});

describe('calculateManaRegenTime', () => {
  it('returns "now" when current >= required', () => {
    expect(calculateManaRegenTime(100n, 50n, 200n)).toBe('now');
  });

  it('returns "unknown" when max is 0', () => {
    expect(calculateManaRegenTime(0n, 50n, 0n)).toBe('unknown');
  });

  it('returns time in seconds for small gap', () => {
    // needed=10, max=432000 → ~10 seconds
    expect(calculateManaRegenTime(0n, 10n, 432000n)).toBe('10 seconds');
  });

  it('returns time in minutes', () => {
    // needed=100, max=432000 → 100 seconds → 2 minutes
    expect(calculateManaRegenTime(0n, 100n, 432000n)).toBe('2 minutes');
  });

  it('returns time in hours', () => {
    // needed=10000, max=432000 → 10000 seconds → 3 hours
    expect(calculateManaRegenTime(0n, 10000n, 432000n)).toBe('3 hours');
  });

  it('returns time in days', () => {
    // needed=432000 (full), max=432000 → 5 days
    expect(calculateManaRegenTime(0n, 432000n, 432000n)).toBe('5 days');
  });
});
