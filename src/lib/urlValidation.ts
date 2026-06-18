/**
 * URL validation utilities for the DApp browser
 */

/** Validate and normalize a URL for the DApp browser. Returns null if invalid. */
export function validateDAppUrl(input: string): { url: string; error?: string } | null {
  let url = input.trim();
  if (!url) return null;

  // Add https:// if no protocol specified
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Block HTTP
  if (url.startsWith('http://')) {
    return { url, error: 'HTTP connections are not allowed. Only HTTPS URLs can be opened in the wallet browser.' };
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return null;
  }

  return { url };
}

/** Check if a URL is HTTPS */
export function isSecureUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
