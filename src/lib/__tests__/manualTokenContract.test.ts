import { ManualTokenContract } from '../manualTokenContract';
import * as protobuf from 'protobufjs/minimal';
import { utils, Transaction } from 'koilib';
import { submitTransactionOnce, TransactionOutcomeUnknownError } from '../transactionBroadcast';
import { readPayerCapacity } from '../mana';

jest.mock('../transactionJournal', () => ({ settleJournalTransactions: jest.fn(async () => undefined) }));
jest.mock('../mana', () => ({ ...jest.requireActual('../mana'), readPayerCapacity: jest.fn(async () => '10000000000') }));
jest.mock('../transactionBroadcast', () => ({ ...jest.requireActual('../transactionBroadcast'), submitTransactionOnce: jest.fn() }));
jest.mock('../../stores/transactionStore', () => ({ useTransactionStore: { getState: () => ({ addPendingTransaction: jest.fn(), confirmPendingTransactionByChainId: jest.fn() }) } }));
jest.mock('../../stores/tokenStore', () => ({ useTokenStore: { getState: () => ({ getTokenByContractId: () => ({ symbol: 'KOIN' }) }) } }));
jest.mock('koilib', () => {
  const actual = jest.requireActual('koilib');
  return {
    ...actual,
    utils: { ...actual.utils, decodeBase58: jest.fn(() => new Uint8Array([1, 2, 3])), encodeBase64url: jest.fn(() => 'encoded-args') },
    Transaction: jest.fn(function MockTransaction(this: any, config: any) {
      this.transaction = { header: { rc_limit: config.options.rcLimit, payer: config.options.payer }, operations: [] };
      this.pushOperation = jest.fn(async (operation: any) => { this.transaction.operations.push(operation); });
      this.prepare = jest.fn(async () => { this.transaction.id = '0xprepared'; });
      this.send = jest.fn();
    }),
  };
});

const sender = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
const recipient = '14eKAYooeMEPi2G1hYxof7Ud8r7cRk67Q6';
let wait: jest.Mock;
let signer: any;
let contract: ManualTokenContract;

beforeEach(() => {
  jest.clearAllMocks();
  wait = jest.fn(async () => ({ blockNumber: 1 }));
  signer = { getAddress: () => sender, signTransaction: jest.fn(async (tx: any) => { tx.signatures = ['signature']; }) };
  contract = new ManualTokenContract('15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL', { call: jest.fn(), wait } as any);
  (readPayerCapacity as jest.Mock).mockResolvedValue('10000000000');
  (submitTransactionOnce as jest.Mock).mockImplementation(async ({ transaction, pending, onPersisted }) => {
    onPersisted(pending);
    return { id: transaction.id };
  });
});

test('signs the exact reviewed ceiling once and submits through the durable boundary without simulation', async () => {
  await contract.transfer(signer, recipient, '1', { rcLimit: '599999999', networkMode: 'mainnet' });
  expect(Transaction).toHaveBeenCalledTimes(1);
  expect(signer.signTransaction).toHaveBeenCalledTimes(1);
  expect((Transaction as unknown as jest.Mock).mock.instances[0].send).not.toHaveBeenCalled();
  expect(submitTransactionOnce).toHaveBeenCalledWith(expect.objectContaining({
    transaction: expect.objectContaining({ header: expect.objectContaining({ rc_limit: '599999999', payer: sender }), signatures: ['signature'] }),
    pending: expect.objectContaining({ networkMode: 'mainnet', address: sender }),
  }));
});

test('emits accepted callback before confirmation and reports a confirmation timeout as pending', async () => {
  wait.mockRejectedValueOnce(new Error('timeout'));
  const onBroadcastAccepted = jest.fn();
  await expect(contract.transfer(signer, recipient, '1', { rcLimit: '123', onBroadcastAccepted })).rejects.toBeInstanceOf(TransactionOutcomeUnknownError);
  expect(onBroadcastAccepted).toHaveBeenCalledWith({ transactionId: '0xprepared', timestamp: expect.any(Number) });
});

test('encodes memo as field 4 and preserves its exact amount', async () => {
  await contract.transfer(signer, recipient, '1.00000001', { rcLimit: '123', memo: 'Invoice 42' });
  const reader = protobuf.Reader.create((utils.encodeBase64url as jest.Mock).mock.calls[0][0]);
  const values: Record<string, string> = {};
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag >>> 3 === 4) values.memo = reader.string();
    else if (tag >>> 3 === 3) values.amount = reader.uint64().toString();
    else reader.skipType(tag & 7);
  }
  expect(values).toEqual({ memo: 'Invoice 42', amount: '100000001' });
});

test('fails before signing when capacity or current authority is unavailable', async () => {
  (readPayerCapacity as jest.Mock).mockResolvedValueOnce('100');
  await expect(contract.transfer(signer, recipient, '1', { rcLimit: '101' })).rejects.toThrow('available');
  expect(signer.signTransaction).not.toHaveBeenCalled();
  await expect(contract.transfer(signer, recipient, '1', { rcLimit: '100', assertCurrent: () => { throw new Error('cancelled'); } })).rejects.toThrow('cancelled');
  expect(submitTransactionOnce).not.toHaveBeenCalled();
});

test('preserves uncertainty from submission and makes no confirmation or second submit call', async () => {
  (submitTransactionOnce as jest.Mock).mockRejectedValueOnce(new TransactionOutcomeUnknownError('0xprepared'));
  await expect(contract.transfer(signer, recipient, '1', { rcLimit: '123' })).rejects.toMatchObject({ transactionId: '0xprepared' });
  expect(submitTransactionOnce).toHaveBeenCalledTimes(1);
  expect(wait).not.toHaveBeenCalled();
});
