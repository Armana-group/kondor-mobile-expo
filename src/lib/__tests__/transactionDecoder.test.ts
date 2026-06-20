import {
  decodeKnownOperation,
  hasKoinDxSwapOperation,
} from '../transactionDecoder';
import { KOINDX } from '../constants';
import { encodeApproveArgs, encodeSwapTokensInArgs } from '../koindxCodec';
import { utils } from 'koilib';
import * as protobuf from 'protobufjs/minimal';

function encodeTransferArgs(params: {
  from: string;
  to: string;
  value: string;
  memo?: string;
}): string {
  const writer = protobuf.Writer.create();
  writer.uint32(0x0a);
  writer.bytes(utils.decodeBase58(params.from));
  writer.uint32(0x12);
  writer.bytes(utils.decodeBase58(params.to));
  writer.uint32(0x18);
  writer.uint64(params.value);
  if (params.memo) {
    writer.uint32(0x22);
    writer.string(params.memo);
  }
  return utils.encodeBase64url(writer.finish());
}

describe('transactionDecoder', () => {
  const owner = '12vRwxu2nVG2697dM36KMNkmfecNdU8PpR';
  const receiver = '1LQPQ6rX9r9ZP7s2cb6cQJu1WDVYj1WFv6';

  it('labels KOIN transfers with decoded amount and destination', () => {
    const operation = decodeKnownOperation({
      call_contract: {
        contract_id: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
        entry_point: 0x27f576ca,
        args: encodeTransferArgs({
          from: owner,
          to: receiver,
          value: '123456789',
          memo: 'Invoice 42',
        }),
      },
    });

    expect(operation.title).toBe('Transfer KOIN');
    expect(operation.details).toContainEqual({
      label: 'Amount',
      value: '1.23456789 KOIN',
    });
    expect(operation.details).toContainEqual({
      label: 'To',
      value: receiver,
    });
    expect(operation.details).toContainEqual({
      label: 'Memo',
      value: 'Invoice 42',
    });
  });

  it('labels token approve operations for KoinDX periphery', () => {
    const operation = decodeKnownOperation({
      call_contract: {
        contract_id: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
        entry_point: KOINDX.ENTRY_POINTS.TOKEN_APPROVE,
        args: encodeApproveArgs(
          owner,
          KOINDX.PERIPHERY_CONTRACT,
          '100000000'
        ),
      },
    });

    expect(operation.title).toBe('Approve KOIN spend');
    expect(operation.details).toContainEqual({
      label: 'Amount',
      value: '1 KOIN',
    });
    expect(operation.details).toContainEqual({
      label: 'Spender',
      value: KOINDX.PERIPHERY_CONTRACT,
    });
  });

  it('labels current KoinDX swap_tokens_in operations', () => {
    const operation = decodeKnownOperation({
      call_contract: {
        contract_id: KOINDX.PERIPHERY_CONTRACT,
        entry_point: KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN,
        args: encodeSwapTokensInArgs({
          from: owner,
          receiver: owner,
          amountIn: '100000000',
          amountOutMin: '50000000',
          path: ['koin', 'vhp'],
        }),
      },
    });

    expect(operation.title).toBe('Swap KOIN for VHP');
    expect(operation.details).toContainEqual({
      label: 'Amount In',
      value: '1 KOIN',
    });
    expect(operation.details).toContainEqual({
      label: 'Route',
      value: 'KOIN -> VHP',
    });
  });

  it('keeps unknown contract calls explicit and inspectable', () => {
    const operation = decodeKnownOperation({
      call_contract: {
        contract_id: '1UnknownContract',
        entry_point: 123,
        args: 'opaque',
      },
    });

    expect(operation.title).toBe('Contract Call (Entry: 0x7b)');
    expect(operation.details).toContainEqual({
      label: 'Contract ID',
      value: '1UnknownContract',
    });
    expect(operation.details).toContainEqual({
      label: 'Entry Point',
      value: '0x7b',
    });
    expect(operation.details).toContainEqual({
      label: 'Arguments',
      value: 'opaque',
    });
  });

  it('keeps unknown system calls explicit and inspectable', () => {
    const operation = decodeKnownOperation({
      set_system_call: {
        call_id: 99,
        target: {
          system_call_bundle: {
            contract_id: '1UnknownContract',
            entry_point: 456,
          },
        },
      },
    });

    expect(operation.title).toBe('Unknown System Call');
    expect(operation.details).toContainEqual({
      label: 'Call ID',
      value: '99',
    });
    expect(operation.details).toContainEqual({
      label: 'Contract ID',
      value: '1UnknownContract',
    });
    expect(operation.details).toContainEqual({
      label: 'Entry Point',
      value: '0x1c8',
    });
  });

  it('detects KoinDX swap operations that need native swap handling', () => {
    expect(hasKoinDxSwapOperation([
      {
        call_contract: {
          contract_id: KOINDX.PERIPHERY_CONTRACT,
          entry_point: KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN,
          args: 'encoded-swap',
        },
      },
    ])).toBe(true);

    expect(hasKoinDxSwapOperation([
      {
        call_contract: {
          contract_id: KOINDX.PERIPHERY_CONTRACT,
          entry_point: KOINDX.ENTRY_POINTS.GET_PAIR,
          args: 'encoded-read',
        },
      },
    ])).toBe(false);
  });
});
