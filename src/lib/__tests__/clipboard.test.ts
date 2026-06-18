import * as Clipboard from 'expo-clipboard';
import { copyWithAutoClear } from '../clipboard';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('copyWithAutoClear', () => {
  it('copies text to clipboard', async () => {
    await copyWithAutoClear('secret text');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('secret text');
  });

  it('clears clipboard after 30 seconds if unchanged', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('secret text');

    await copyWithAutoClear('secret text');

    // Fast-forward 30 seconds
    jest.advanceTimersByTime(30_000);

    // Allow pending promises to resolve
    await Promise.resolve();
    await Promise.resolve();

    expect(Clipboard.getStringAsync).toHaveBeenCalled();
    // Second call should clear the clipboard
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('');
  });

  it('does not clear clipboard if content changed', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue('something else');

    await copyWithAutoClear('secret text');

    jest.advanceTimersByTime(30_000);
    await Promise.resolve();
    await Promise.resolve();

    // setStringAsync called once for the copy, but NOT for clearing
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('secret text');
  });
});
