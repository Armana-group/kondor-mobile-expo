import { Provider, Signer, Transaction } from 'koilib';
import { KOINDX } from '../constants';
import {
  buildSwapTransaction,
  executeSwapTransaction,
  type SwapExecutionStatus,
} from '../swapTransaction';
import type { SwapToken } from '../swapMath';
import type { SwapQuote } from '../swapQuote';

let mockDryRunReceipt: {
  id: string;
  rc_used?: string;
  reverted: boolean;
  rpc_error?: unknown;
};
let mockBroadcastReceipt: {
  id: string;
  rc_used?: string;
  reverted: boolean;
  rpc_error?: unknown;
};
let mockDryRunError: Error | null;
let mockBroadcastError: Error | null;
let mockWait: jest.Mock;

jest.mock('koilib', () => {
  const actual = jest.requireActual('koilib');
  return {
    ...actual,
    Transaction: jest.fn(function MockTransaction(this: any, config: any) {
      this.config = config;
      this.transaction = { header: {}, operations: [] };
      this.pushOperation = jest.fn(async (operation: any) => {
        this.transaction.operations.push(operation);
      });
      this.prepare = jest.fn(async () => {
        this.transaction.id = '0xprepared';
      });
      this.send = jest.fn(async ({ broadcast } = { broadcast: true }) => {
        if (broadcast) {
          if (mockBroadcastError) {
            throw mockBroadcastError;
          }
          return mockBroadcastReceipt;
        }

        if (mockDryRunError) {
          throw mockDryRunError;
        }
        return mockDryRunReceipt;
      });
      this.wait = mockWait;
    }),
  };
});

const koin: SwapToken = {
  contractId: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
  symbol: 'KOIN',
  name: 'Koinos',
  decimals: 8,
  icon: '',
  balance: '10',
};

const vhp: SwapToken = {
  contractId: '12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq',
  symbol: 'VHP',
  name: 'Virtual Hash Power',
  decimals: 8,
  icon: '',
  balance: '0',
};

const quote: SwapQuote = {
  tokenInContractId: koin.contractId,
  tokenOutContractId: vhp.contractId,
  amountIn: '1',
  amountInBaseUnits: '100000000',
  amountOut: '0.45',
  amountOutBaseUnits: '45000000',
  amountOutMin: '0.44775',
  amountOutMinBaseUnits: '44775000',
  priceImpact: 0.1,
  executionPrice: 0.45,
  spotPrice: 0.451,
  route: ['koin', 'vhp'],
  pairAddress: '17PairAddress',
  fee: 0.0025,
  timestamp: 1,
  expiresAt: Date.now() + 60_000,
};

const signer = {
  getAddress: () => '12vRwxu2nVG2697dM36KMNkmfecNdU8PpR',
  signTransaction: jest.fn(async (transaction: { id?: string }) => {
    if (!transaction.id) {
      throw new Error('Missing transaction id');
    }
  }),
} as unknown as Signer;

describe('swapTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDryRunReceipt = {
      id: '0xdryrun',
      rc_used: '50000000',
      reverted: false,
    };
    mockBroadcastReceipt = {
      id: '0xsent',
      rc_used: '50000000',
      reverted: false,
    };
    mockDryRunError = null;
    mockBroadcastError = null;
    mockWait = jest.fn(async () => ({ blockNumber: 123 }));
  });

  it('builds approve before swap_tokens_in with wallet as payer', async () => {
    const tx = await buildSwapTransaction({
      provider: {} as Provider,
      signer,
      quote,
      tokenIn: koin,
      tokenOut: vhp,
      allTokens: [koin, vhp],
      rcLimit: 55_000_000,
    });

    expect(tx.transaction.header?.payer).toBe('12vRwxu2nVG2697dM36KMNkmfecNdU8PpR');
    expect(tx.transaction.header?.payee).toBeUndefined();
    expect((Transaction as unknown as jest.Mock).mock.calls[0][0].options).toEqual({
      payer: '12vRwxu2nVG2697dM36KMNkmfecNdU8PpR',
      rcLimit: 55_000_000,
    });
    const operations = tx.transaction.operations ?? [];
    expect(operations).toHaveLength(2);
    expect(operations[0].call_contract?.contract_id).toBe(koin.contractId);
    expect(operations[0].call_contract?.entry_point).toBe(KOINDX.ENTRY_POINTS.TOKEN_APPROVE);
    expect(operations[1].call_contract?.contract_id).toBe(KOINDX.PERIPHERY_CONTRACT);
    expect(operations[1].call_contract?.entry_point).toBe(KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN);
  });

  it('dry-runs before final signing and broadcast', async () => {
    const statuses: SwapExecutionStatus[] = [];
    const result = await executeSwapTransaction({
      provider: {} as Provider,
      signer,
      quote,
      tokenIn: koin,
      tokenOut: vhp,
      allTokens: [koin, vhp],
      maxRc: 1_000_000_000,
      availableRc: 1_000_000_000,
      onStatus: (status) => statuses.push(status),
    });

    expect(result.transactionId).toBe('0xsent');
    expect(result.blockHeight).toBe(123);
    expect(Transaction).toHaveBeenCalledTimes(2);
    const transactionMock = Transaction as unknown as jest.Mock;
    const dryRunTx = transactionMock.mock.instances[0];
    const finalTx = transactionMock.mock.instances[1];
    const signTransactionMock = signer.signTransaction as jest.Mock;

    expect(transactionMock.mock.calls[0][0].options.rcLimit).toBe(1_000_000_000);
    expect(transactionMock.mock.calls[1][0].options.rcLimit).toBe(Math.floor(50_000_000 * 1.1));
    expect(dryRunTx.send).toHaveBeenCalledWith({ broadcast: false });
    expect(finalTx.send).toHaveBeenCalledWith({ broadcast: true });
    expect(dryRunTx.send.mock.invocationCallOrder[0]).toBeLessThan(
      finalTx.send.mock.invocationCallOrder[0]
    );
    expect(finalTx.prepare).toHaveBeenCalledTimes(1);
    expect(signTransactionMock).toHaveBeenCalledTimes(1);
    expect(finalTx.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      signTransactionMock.mock.invocationCallOrder[0]
    );
    expect(signTransactionMock.mock.invocationCallOrder[0]).toBeLessThan(
      finalTx.send.mock.invocationCallOrder[0]
    );
    expect(statuses).toEqual([
      'building',
      'estimating_mana',
      'signing',
      'broadcasting',
      'confirming',
      'confirmed',
    ]);
  });

  it('caps the swap dry-run rc limit to currently available rc', async () => {
    await executeSwapTransaction({
      provider: {} as Provider,
      signer,
      quote,
      tokenIn: koin,
      tokenOut: vhp,
      allTokens: [koin, vhp],
      maxRc: 1_000_000_000,
      availableRc: 100_000_000,
    });

    const transactionMock = Transaction as unknown as jest.Mock;
    expect(transactionMock.mock.calls[0][0].options.rcLimit).toBe(100_000_000);
  });

  it('caps the final rc limit to available rc when the estimate fits', async () => {
    mockDryRunReceipt = {
      id: '0xdryrun',
      rc_used: '50000000',
      reverted: false,
    };

    await executeSwapTransaction({
      provider: {} as Provider,
      signer,
      quote,
      tokenIn: koin,
      tokenOut: vhp,
      allTokens: [koin, vhp],
      maxRc: 1_000_000_000,
      availableRc: 52_000_000,
    });

    const transactionMock = Transaction as unknown as jest.Mock;
    expect(transactionMock.mock.calls[0][0].options.rcLimit).toBe(52_000_000);
    expect(transactionMock.mock.calls[1][0].options.rcLimit).toBe(52_000_000);
  });

  it('reports insufficient mana when the dry-run rc rejection is returned as an error', async () => {
    mockDryRunError = new Error(JSON.stringify({
      error: 'payer does not have the rc to cover transaction rc limit',
      code: -1,
      logs: [],
    }));

    await expect(executeSwapTransaction({
      provider: {} as Provider,
      signer,
      quote,
      tokenIn: koin,
      tokenOut: vhp,
      allTokens: [koin, vhp],
      maxRc: 1_000_000_000,
      availableRc: 100_000_000,
    })).rejects.toThrow(/Insufficient mana to pay for this swap/i);

    expect(Transaction).toHaveBeenCalledTimes(1);
    expect(signer.signTransaction).not.toHaveBeenCalled();
  });

  it('reports insufficient mana when the final broadcast rc rejection is returned as an error', async () => {
    mockBroadcastError = new Error(JSON.stringify({
      error: 'payer does not have the rc to cover transaction rc limit',
      code: -1,
      logs: [],
    }));

    await expect(executeSwapTransaction({
      provider: {} as Provider,
      signer,
      quote,
      tokenIn: koin,
      tokenOut: vhp,
      allTokens: [koin, vhp],
      maxRc: 1_000_000_000,
      availableRc: 100_000_000,
    })).rejects.toThrow(/Insufficient mana to pay for this swap/i);
  });

  it('refuses zero minimum output before building operations', async () => {
    await expect(buildSwapTransaction({
      provider: {} as Provider,
      signer,
      quote: { ...quote, amountOutMinBaseUnits: '0' },
      tokenIn: koin,
      tokenOut: vhp,
      allTokens: [koin, vhp],
      rcLimit: 55_000_000,
    })).rejects.toThrow(/slippage protection/i);

    expect(Transaction).not.toHaveBeenCalled();
  });

  it('fails closed when dry-run does not return positive rc_used', async () => {
    mockDryRunReceipt = {
      id: '0xdryrun',
      rc_used: '0',
      reverted: false,
    };

    await expect(executeSwapTransaction({
      provider: {} as Provider,
      signer,
      quote,
      tokenIn: koin,
      tokenOut: vhp,
      allTokens: [koin, vhp],
      maxRc: 1_000_000_000,
      availableRc: 100_000_000,
    })).rejects.toThrow(/estimate/i);

    expect(Transaction).toHaveBeenCalledTimes(1);
    expect(signer.signTransaction).not.toHaveBeenCalled();
  });

  it('reports RPC timeout during dry-run without signing or broadcasting', async () => {
    mockDryRunReceipt = {
      id: '0xdryrun',
      rc_used: '',
      reverted: false,
      rpc_error: {
        error: 'An internal server error has occurred',
        data: 'rpc failed, context deadline exceeded',
      },
    };

    await expect(executeSwapTransaction({
      provider: {} as Provider,
      signer,
      quote,
      tokenIn: koin,
      tokenOut: vhp,
      allTokens: [koin, vhp],
      maxRc: 1_000_000_000,
      availableRc: 100_000_000,
    })).rejects.toThrow(/Koinos RPC timed out while simulating the swap/i);

    expect(Transaction).toHaveBeenCalledTimes(1);
    expect(signer.signTransaction).not.toHaveBeenCalled();
  });

  it('returns pending confirmation when broadcast returns an RPC timeout receipt', async () => {
    mockBroadcastReceipt = {
      id: '0xsent',
      rc_used: '',
      reverted: false,
      rpc_error: {
        error: 'An internal server error has occurred',
        data: 'rpc failed, context deadline exceeded',
      },
    };

    const result = await executeSwapTransaction({
      provider: {} as Provider,
      signer,
      quote,
      tokenIn: koin,
      tokenOut: vhp,
      allTokens: [koin, vhp],
      maxRc: 1_000_000_000,
      availableRc: 100_000_000,
    });

    expect(result.transactionId).toBe('0xsent');
    expect(result.confirmationPending).toBe(true);
    expect(result.confirmationError).toContain('context deadline exceeded');
    expect(mockWait).not.toHaveBeenCalled();
  });

  it('returns pending confirmation when confirmation polling hits an RPC deadline', async () => {
    const statuses: SwapExecutionStatus[] = [];
    mockWait.mockRejectedValueOnce(new Error(JSON.stringify({
      error: 'An internal server error has occurred',
      data: 'rpc failed, context deadline exceeded',
    })));

    const result = await executeSwapTransaction({
      provider: {} as Provider,
      signer,
      quote,
      tokenIn: koin,
      tokenOut: vhp,
      allTokens: [koin, vhp],
      maxRc: 1_000_000_000,
      availableRc: 100_000_000,
      onStatus: (status) => statuses.push(status),
    });

    expect(result.transactionId).toBe('0xsent');
    expect(result.confirmationPending).toBe(true);
    expect(result.confirmationError).toContain('context deadline exceeded');
    expect(statuses).toEqual([
      'building',
      'estimating_mana',
      'signing',
      'broadcasting',
      'confirming',
    ]);
  });
});
