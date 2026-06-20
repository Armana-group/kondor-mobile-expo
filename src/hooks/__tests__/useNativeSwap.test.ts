jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  createNativeSwapController,
  getSwapUnavailableMessage,
  getNativeSwapQuoteInvalidReason,
  getScopedSwapTokens,
  type NativeSwapControllerDeps,
} from '../useNativeSwap';
import { MAINNET, TESTNET } from '../../lib/constants';

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

const validQuote = {
  amountOut: '0.45',
  expiresAt: 1_000,
  tokenInContractId: 'koin-contract',
  tokenOutContractId: 'vhp-contract',
  amountIn: '1',
  amountInBaseUnits: '100000000',
  amountOutMinBaseUnits: '44775000',
};

describe('getNativeSwapQuoteInvalidReason', () => {
  it('accepts quotes that match current tokens and amount', () => {
    expect(getNativeSwapQuoteInvalidReason({
      quote: validQuote,
      amount: '1',
      inputTokenContractId: 'koin-contract',
      outputTokenContractId: 'vhp-contract',
      now: 1,
      requireMetadata: true,
    })).toBeNull();
  });

  it('rejects quotes that do not match current tokens or amount', () => {
    expect(getNativeSwapQuoteInvalidReason({
      quote: validQuote,
      amount: '1',
      inputTokenContractId: 'vhp-contract',
      outputTokenContractId: 'koin-contract',
      now: 1,
      requireMetadata: true,
    })).toMatch(/stale/i);

    expect(getNativeSwapQuoteInvalidReason({
      quote: validQuote,
      amount: '2',
      inputTokenContractId: 'koin-contract',
      outputTokenContractId: 'vhp-contract',
      now: 1,
      requireMetadata: true,
    })).toMatch(/stale/i);
  });

  it('rejects zero minimum output quotes for positive inputs', () => {
    expect(getNativeSwapQuoteInvalidReason({
      quote: { ...validQuote, amountOutMinBaseUnits: '0' },
      amount: '1',
      inputTokenContractId: 'koin-contract',
      outputTokenContractId: 'vhp-contract',
      now: 1,
      requireMetadata: true,
    })).toMatch(/minimum output/i);
  });
});

describe('getSwapUnavailableMessage', () => {
  it('allows mainnet swap execution', () => {
    expect(getSwapUnavailableMessage(MAINNET)).toBeNull();
  });

  it('fails closed on Harbinger', () => {
    expect(getSwapUnavailableMessage(TESTNET)).toMatch(/mainnet/i);
    expect(getSwapUnavailableMessage(TESTNET)).toMatch(/Harbinger/i);
  });
});

describe('getScopedSwapTokens', () => {
  const mainnetToken = {
    contractId: MAINNET.koinContract,
    symbol: 'KOIN',
    name: 'Koinos',
    decimals: 8,
    icon: '',
    balance: '1',
    isLoading: false,
  };

  it('hides stale token lists until the active network scope is initialized', () => {
    expect(getScopedSwapTokens({
      hasHydrated: true,
      networkMode: 'harbinger',
      address: '1WalletAddress',
      cacheKey: 'mainnet:1WalletAddress',
      tokens: [mainnetToken],
    })).toEqual([]);
  });

  it('keeps active-scope tokens available after initialization', () => {
    expect(getScopedSwapTokens({
      hasHydrated: true,
      networkMode: 'harbinger',
      address: '1WalletAddress',
      cacheKey: 'harbinger:1WalletAddress',
      tokens: [mainnetToken],
    })).toEqual([mainnetToken]);
  });
});

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

  it('does not request quotes for amounts rejected by amount validation', async () => {
    const getSwapQuote = jest.fn();
    const controller = createNativeSwapController(createDeps({
      getSwapQuote,
      validateAmount: () => 'Amount exceeds available KOIN balance',
    }));

    await controller.setAmount('1000');
    await controller.flushQuote();

    expect(getSwapQuote).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({
      status: 'error',
      quote: null,
      error: 'Amount exceeds available KOIN balance',
      isQuoteLoading: false,
    });
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

  it('rejects execution when quote amount does not match current amount', async () => {
    const executeSwapTransaction = jest.fn();
    const controller = createNativeSwapController(createDeps({
      getSwapQuote: jest.fn(async () => ({ ...validQuote, amountIn: '0.5' })),
      executeSwapTransaction,
      now: () => 10,
    }));

    await controller.setAmount('1');
    await controller.flushQuote();

    await expect(controller.execute()).rejects.toThrow(/stale/i);
    expect(executeSwapTransaction).not.toHaveBeenCalled();
  });

  it('rejects zero minimum output quotes before execution', async () => {
    const executeSwapTransaction = jest.fn();
    const controller = createNativeSwapController(createDeps({
      getSwapQuote: jest.fn(async () => ({ ...validQuote, amountOutMinBaseUnits: '0' })),
      executeSwapTransaction,
      now: () => 10,
    }));

    await controller.setAmount('1');
    await controller.flushQuote();

    await expect(controller.execute()).rejects.toThrow(/minimum output/i);
    expect(executeSwapTransaction).not.toHaveBeenCalled();
  });
});
