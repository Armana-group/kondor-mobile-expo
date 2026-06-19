import {
  createNativeSwapController,
  type NativeSwapControllerDeps,
} from '../useNativeSwap';

function createDeps(
  overrides: Partial<NativeSwapControllerDeps> = {}
): NativeSwapControllerDeps {
  return {
    getSwapQuote: jest.fn(),
    executeSwapTransaction: jest.fn(),
    now: () => 1,
    ...overrides,
  };
}

describe('createNativeSwapController', () => {
  it('does not request quotes for empty or zero amounts', async () => {
    const getSwapQuote = jest.fn();
    const controller = createNativeSwapController(createDeps({ getSwapQuote }));

    await controller.setAmount('');
    await controller.flushQuote();

    expect(getSwapQuote).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe('idle');
  });

  it('moves to ready after a quote resolves', async () => {
    const quote = { amountOut: '0.45', expiresAt: Date.now() + 60_000 };
    const controller = createNativeSwapController(createDeps({
      getSwapQuote: jest.fn(async () => quote),
    }));

    await controller.setAmount('1');
    await controller.flushQuote();

    expect(controller.getState().status).toBe('ready');
    expect(controller.getState().quote).toBe(quote);
  });

  it('rejects execution when the quote is expired', async () => {
    const controller = createNativeSwapController(createDeps({
      getSwapQuote: jest.fn(async () => ({ amountOut: '0.45', expiresAt: 1 })),
      now: () => 10,
    }));

    await controller.setAmount('1');
    await controller.flushQuote();

    await expect(controller.execute()).rejects.toThrow(/expired/i);
  });
});
