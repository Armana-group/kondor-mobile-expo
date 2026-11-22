import { parseManaLimit, formatMana, assertManaCapacity } from '../mana';

test('keeps a reviewed ceiling exact and rejects rounding, overflow and zero', () => {
  expect(parseManaLimit('5.99999999')).toBe('599999999');
  expect(parseManaLimit('184467440737.09551615')).toBe('18446744073709551615');
  for (const value of ['5.999999995', '184467440737.09551616', '0', '-1', '1e3', '1.']) {
    expect(() => parseManaLimit(value)).toThrow();
  }
  expect(formatMana('599999999')).toBe('5.99999999');
  expect(() => assertManaCapacity('600000000', '599999999')).toThrow();
});

import { readPayerCapacity } from '../mana';
import * as protobuf from 'protobufjs/minimal';
import { utils } from 'koilib';

function integers(fields: Record<number, string>): string {
  const writer = protobuf.Writer.create();
  for (const [key, value] of Object.entries(fields)) writer.uint32(Number(key) << 3).uint64(value);
  return utils.encodeBase64url(writer.finish());
}

test('limits available mana by balance, subtracts reservations and outgoing KOIN without rounding', async () => {
  const call = jest.fn(async (method: string) => {
    if (method === 'mempool.get_reserved_account_rc') return { rc: '2' };
    if (method === 'chain.get_account_rc') return { rc: '9007199254740999' };
    return { result: integers({ 1: '9007199254740997' }) };
  });
  expect(await readPayerCapacity({ provider: { call } as any, payer: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT', koinContract: 'koin', outgoingKoin: '3' })).toBe('9007199254740992');
});

test('applies the sponsor strict ceiling and fails closed on unreadable reservations', async () => {
  const call = jest.fn(async (method: string, params: any) => {
    if (method === 'mempool.get_reserved_account_rc') return { rc: '10' };
    return { result: params.entry_point === 0x72cdbfdd ? integers({ 4: '1000', 5: '500' }) : integers({ 1: '200' }) };
  });
  const params = { provider: { call } as any, payer: 'sponsor', sponsor: 'sponsor', koinContract: 'koin' };
  expect(await readPayerCapacity(params)).toBe('199');
  call.mockRejectedValueOnce(new Error('offline'));
  await expect(readPayerCapacity(params)).rejects.toThrow('offline');
});
