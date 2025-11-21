/**
 * Truncate an address for display
 * @param address - The full address
 * @param length - Number of characters to show at start and end
 */
export const truncateAddress = (address: string, length: number = 6): string => {
  if (!address) return '';
  return `${address.slice(0, length)}...${address.slice(-4)}`;
};

/**
 * Compact a string for display
 * @param word - The string to compact
 * @param length - Number of characters to show at start and end
 */
export const compactString = (word: string, length: number): string => {
  if (!word || word.length <= length * 2) return word;
  return `${word.substring(0, length)}...${word.substring(word.length - length, word.length)}`;
};

/**
 * Format currency for display
 * @param price - The price to format
 * @param maximumSignificantDigits - Maximum significant digits (default: 6)
 */
export const formatCurrency = (price: number, maximumSignificantDigits: number = 6) => {
  return new Intl.NumberFormat('en-US', {
    maximumSignificantDigits,
  }).format(price ?? 0);
};

/**
 * Format KOIN balance for display (8 decimal places)
 * @param balance - The balance in smallest unit
 */
export const formatKoinBalance = (balance: string): string => {
  if (!balance) return '0.00';
  const num = parseFloat(balance);
  return num.toFixed(2);
};

/**
 * Validate Koinos address format
 * @param address - The address to validate
 */
export const isValidAddress = (address: string): boolean => {
  // Koinos addresses are base58 encoded and typically 34 characters
  const addressRegex = /^[1-9A-HJ-NP-Za-km-z]{33,35}$/;
  return addressRegex.test(address);
};

/**
 * Calculate mana regeneration time estimate
 * @param current - Current mana amount
 * @param required - Required mana amount
 * @param max - Maximum mana (based on balance)
 * @returns Human-readable time estimate
 */
export const calculateManaRegenTime = (
  current: bigint,
  required: bigint,
  max: bigint
): string => {
  if (current >= required) return 'now';
  if (max === 0n) return 'unknown';

  const needed = required - current;
  const FULL_REGEN_TIME = 432000; // 5 days in seconds

  // Calculate time needed: (needed / max) * full_regen_time
  const secondsNeeded = Number(needed * BigInt(FULL_REGEN_TIME) / max);

  if (secondsNeeded < 60) return `${Math.ceil(secondsNeeded)} seconds`;
  if (secondsNeeded < 3600) return `${Math.ceil(secondsNeeded / 60)} minutes`;
  if (secondsNeeded < 86400) return `${Math.ceil(secondsNeeded / 3600)} hours`;
  return `${Math.ceil(secondsNeeded / 86400)} days`;
};