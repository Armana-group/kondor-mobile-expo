import { utils } from 'koilib';
import * as protobuf from 'protobufjs/minimal';
import {
  decodeGetPairResult,
  decodeGetReservesResult,
  decodeUint64Result,
  encodeApproveArgs,
  encodeGetAmountOutArgs,
  encodeGetPairArgs,
  encodeGetReservesArgs,
  encodeSwapTokensInArgs,
} from '../koindxCodec';

function base64url(bytes: Uint8Array): string {
  return utils.encodeBase64url(bytes);
}

describe('koindxCodec', () => {
  it('encodes get_pair string arguments', () => {
    const bytes = utils.decodeBase64url(encodeGetPairArgs('koin', 'vhp'));
    const reader = protobuf.Reader.create(bytes);
    expect(reader.uint32()).toBe(0x0a);
    expect(reader.string()).toBe('koin');
    expect(reader.uint32()).toBe(0x12);
    expect(reader.string()).toBe('vhp');
  });

  it('decodes get_pair address bytes', () => {
    const pairAddress = '17e1q6Fh5RgnuA8K7v4KvXXH4k9qHgsT5s';
    const writer = protobuf.Writer.create();
    writer.uint32(0x0a);
    writer.bytes(utils.decodeBase58(pairAddress));
    expect(decodeGetPairResult(base64url(writer.finish()))).toBe(pairAddress);
  });

  it('encodes empty reserves args and decodes reserves', () => {
    expect(encodeGetReservesArgs()).toBe(utils.encodeBase64url(new Uint8Array()));
    const writer = protobuf.Writer.create();
    writer.uint32(0x0a);
    writer.string('0');
    writer.uint32(0x10);
    writer.uint64('100000000');
    writer.uint32(0x18);
    writer.uint64('50000000');
    writer.uint32(0x20);
    writer.uint64('1');
    expect(decodeGetReservesResult(base64url(writer.finish()))).toEqual({
      reserveA: '100000000',
      reserveB: '50000000',
    });
  });

  it('encodes get_amount_out uint64 arguments and decodes uint64 result', () => {
    const bytes = utils.decodeBase64url(encodeGetAmountOutArgs('100', '200', '300'));
    const reader = protobuf.Reader.create(bytes);
    expect(reader.uint32()).toBe(0x08);
    expect(reader.uint64().toString()).toBe('100');
    expect(reader.uint32()).toBe(0x10);
    expect(reader.uint64().toString()).toBe('200');
    expect(reader.uint32()).toBe(0x18);
    expect(reader.uint64().toString()).toBe('300');

    const writer = protobuf.Writer.create();
    writer.uint32(0x08);
    writer.uint64('12345');
    expect(decodeUint64Result(base64url(writer.finish()))).toBe('12345');
  });

  it('encodes token approve args with owner, spender, and value', () => {
    const owner = '12vRwxu2nVG2697dM36KMNkmfecNdU8PpR';
    const spender = '17e1q6Fh5RgnuA8K7v4KvXXH4k9qHgsT5s';
    const bytes = utils.decodeBase64url(encodeApproveArgs(owner, spender, '100000000'));
    const reader = protobuf.Reader.create(bytes);
    expect(reader.uint32()).toBe(0x0a);
    expect(utils.encodeBase58(reader.bytes())).toBe(owner);
    expect(reader.uint32()).toBe(0x12);
    expect(utils.encodeBase58(reader.bytes())).toBe(spender);
    expect(reader.uint32()).toBe(0x18);
    expect(reader.uint64().toString()).toBe('100000000');
  });

  it('encodes swap_tokens_in args in current KoinDX field order', () => {
    const account = '12vRwxu2nVG2697dM36KMNkmfecNdU8PpR';
    const bytes = utils.decodeBase64url(encodeSwapTokensInArgs({
      from: account,
      receiver: account,
      amountIn: '100000000',
      amountOutMin: '50000000',
      path: ['koin', 'vhp'],
    }));
    const reader = protobuf.Reader.create(bytes);
    expect(reader.uint32()).toBe(0x0a);
    expect(utils.encodeBase58(reader.bytes())).toBe(account);
    expect(reader.uint32()).toBe(0x12);
    expect(utils.encodeBase58(reader.bytes())).toBe(account);
    expect(reader.uint32()).toBe(0x18);
    expect(reader.uint64().toString()).toBe('100000000');
    expect(reader.uint32()).toBe(0x20);
    expect(reader.uint64().toString()).toBe('50000000');
    expect(reader.uint32()).toBe(0x2a);
    expect(reader.string()).toBe('koin');
    expect(reader.uint32()).toBe(0x2a);
    expect(reader.string()).toBe('vhp');
  });
});
