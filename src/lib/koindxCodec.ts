import { utils } from 'koilib';
import * as protobuf from 'protobufjs/minimal';

export interface SwapTokensInArgs {
  from: string;
  receiver: string;
  amountIn: string;
  amountOutMin: string;
  path: string[];
}

export function encodeGetPairArgs(tokenA: string, tokenB: string): string {
  const writer = protobuf.Writer.create();
  writer.uint32(0x0a);
  writer.string(tokenA);
  writer.uint32(0x12);
  writer.string(tokenB);
  return utils.encodeBase64url(writer.finish());
}

export function decodeGetPairResult(base64url: string): string | null {
  const reader = protobuf.Reader.create(utils.decodeBase64url(base64url));

  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag >>> 3 === 1) {
      return utils.encodeBase58(reader.bytes());
    }
    reader.skipType(tag & 7);
  }

  return null;
}

export function encodeGetReservesArgs(): string {
  return utils.encodeBase64url(new Uint8Array());
}

export function decodeGetReservesResult(base64url: string): { reserveA: string; reserveB: string } {
  const reader = protobuf.Reader.create(utils.decodeBase64url(base64url));
  let reserveA = '0';
  let reserveB = '0';

  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    switch (tag >>> 3) {
      case 2:
        reserveA = reader.uint64().toString();
        break;
      case 3:
        reserveB = reader.uint64().toString();
        break;
      default:
        reader.skipType(tag & 7);
        break;
    }
  }

  return { reserveA, reserveB };
}

export function encodeGetAmountOutArgs(
  amountIn: string,
  reserveIn: string,
  reserveOut: string
): string {
  const writer = protobuf.Writer.create();
  writer.uint32(0x08);
  writer.uint64(amountIn);
  writer.uint32(0x10);
  writer.uint64(reserveIn);
  writer.uint32(0x18);
  writer.uint64(reserveOut);
  return utils.encodeBase64url(writer.finish());
}

export function decodeUint64Result(base64url: string): string | null {
  const reader = protobuf.Reader.create(utils.decodeBase64url(base64url));

  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag >>> 3 === 1) {
      return reader.uint64().toString();
    }
    reader.skipType(tag & 7);
  }

  return null;
}

export function encodeApproveArgs(owner: string, spender: string, value: string): string {
  const writer = protobuf.Writer.create();
  writer.uint32(0x0a);
  writer.bytes(utils.decodeBase58(owner));
  writer.uint32(0x12);
  writer.bytes(utils.decodeBase58(spender));
  writer.uint32(0x18);
  writer.uint64(value);
  return utils.encodeBase64url(writer.finish());
}

export function encodeSwapTokensInArgs(args: SwapTokensInArgs): string {
  const writer = protobuf.Writer.create();
  writer.uint32(0x0a);
  writer.bytes(utils.decodeBase58(args.from));
  writer.uint32(0x12);
  writer.bytes(utils.decodeBase58(args.receiver));
  writer.uint32(0x18);
  writer.uint64(args.amountIn);
  writer.uint32(0x20);
  writer.uint64(args.amountOutMin);

  for (const pathItem of args.path) {
    writer.uint32(0x2a);
    writer.string(pathItem);
  }

  return utils.encodeBase64url(writer.finish());
}
