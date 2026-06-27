import { ManualTokenContract } from '../manualTokenContract';
import * as protobuf from 'protobufjs/minimal';
import { utils } from 'koilib';

let mockSend = jest.fn();
let mockWait = jest.fn();

jest.mock('koilib', () => {
  const actual = jest.requireActual('koilib');

  return {
    ...actual,
    utils: {
      ...actual.utils,
      decodeBase58: jest.fn(() => new Uint8Array([1, 2, 3])),
      encodeBase64url: jest.fn(() => 'encoded-args'),
      parseUnits: jest.fn(() => '100000000'),
    },
    Transaction: jest.fn(function MockTransaction(this: any, config: any) {
      this.config = config;
      this.transaction = { header: { rc_limit: config?.options?.rcLimit }, operations: [] };
      this.pushOperation = jest.fn(async (operation: any) => {
        this.transaction.operations.push(operation);
      });
      this.send = mockSend;
      this.wait = mockWait;
    }),
  };
});

describe('ManualTokenContract transfer broadcast hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend = jest.fn(async () => ({ id: '0xaccepted' }));
    mockWait = jest.fn(() => new Promise(() => {}));
  });

  it('fires the accepted-broadcast hook before confirmation finishes', async () => {
    const onBroadcastAccepted = jest.fn();
    const contract = new ManualTokenContract('15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL', {
      call: jest.fn(),
    } as any);

    const transferPromise = contract.transfer(
      {
        getAddress: () => '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
      } as any,
      '14eKAYooeMEPi2G1hYxof7Ud8r7cRk67Q6',
      '1',
      {
        rcLimit: 123,
        onBroadcastAccepted,
      }
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onBroadcastAccepted).toHaveBeenCalledWith({
      transactionId: '0xaccepted',
      timestamp: expect.any(Number),
    });

    let settled = false;
    void transferPromise.then(() => {
      settled = true;
    });

    await Promise.resolve();

    expect(settled).toBe(false);
    expect(mockWait).toHaveBeenCalledTimes(1);
  });

  it('encodes an optional transfer memo as token transfer field 4', async () => {
    mockWait = jest.fn(async () => undefined);
    const contract = new ManualTokenContract('15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL', {
      call: jest.fn(),
    } as any);

    await contract.transfer(
      {
        getAddress: () => '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
      } as any,
      '14eKAYooeMEPi2G1hYxof7Ud8r7cRk67Q6',
      '1',
      {
        rcLimit: 123,
        memo: 'Invoice 42',
      }
    );

    const encodedArgs = (utils.encodeBase64url as jest.Mock).mock.calls[0][0];
    const reader = protobuf.Reader.create(encodedArgs);
    let decodedMemo: string | null = null;

    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      if (tag >>> 3 === 4) {
        decodedMemo = reader.string();
      } else {
        reader.skipType(tag & 7);
      }
    }

    expect(decodedMemo).toBe('Invoice 42');
  });
});
