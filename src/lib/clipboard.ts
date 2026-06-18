import * as Clipboard from 'expo-clipboard';

const CLIPBOARD_CLEAR_DELAY_MS = 30_000; // 30 seconds

/**
 * Copy text to clipboard and automatically clear it after 30 seconds.
 * Only clears if the clipboard still contains the copied text.
 */
export async function copyWithAutoClear(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);

  setTimeout(async () => {
    try {
      const current = await Clipboard.getStringAsync();
      if (current === text) {
        await Clipboard.setStringAsync('');
      }
    } catch {
      // Ignore errors during cleanup
    }
  }, CLIPBOARD_CLEAR_DELAY_MS);
}
