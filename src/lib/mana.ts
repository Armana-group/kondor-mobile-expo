import { utils, type Provider } from 'koilib';
import * as protobuf from 'protobufjs/minimal';

const UINT64_MAX = (1n << 64n) - 1n;
export const DEFAULT_MAX_MANA = '10';

export function validateRcLimit(value: string): string {
  if (!/^\d{1,20}$/.test(value) || BigInt(value) === 0n || BigInt(value) > UINT64_MAX) {
    throw new Error('The mana limit must be positive and within the network limit.');
  }
  return BigInt(value).toString();
}

export function parseManaLimit(value: string): string {
  const match = /^(\d{1,12})(?:\.(\d{1,8}))?$/.exec(value);
  if (!match) throw new Error('Enter a maximum mana amount with up to 8 decimal places.');
  return validateRcLimit((BigInt(match[1]) * 100_000_000n + BigInt((match[2] ?? '').padEnd(8, '0'))).toString());
}

export function formatMana(value: string): string {
  const units = BigInt(value);
  const whole = units / 100_000_000n;
  const fraction = (units % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function resourceValue(value: unknown): bigint {
  if (value === undefined) return 0n;
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value) || BigInt(value) > UINT64_MAX) {
    throw new Error('The network returned an invalid mana balance.');
  }
  return BigInt(value);
}

async function readIntegers(provider: Provider, contractId: string, entryPoint: number, args = ''): Promise<Map<number, bigint>> {
  const result = await provider.call<{ result?: string }>('chain.read_contract', { contract_id: contractId, entry_point: entryPoint, args });
  if (typeof result.result !== 'string') throw new Error('Could not verify payer resources.');
  const reader = protobuf.Reader.create(utils.decodeBase64url(result.result));
  const fields = new Map<number, bigint>();
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if ((tag & 7) === 0) fields.set(tag >>> 3, resourceValue(reader.uint64().toString()));
    else reader.skipType(tag & 7);
  }
  return fields;
}

/** Available capacity includes pending reservations and direct outgoing KOIN. */
export async function readPayerCapacity(params: {
  provider: Provider;
  payer: string;
  koinContract: string;
  sponsor?: string;
  outgoingKoin?: string;
}): Promise<string> {
  const { provider, payer, koinContract, sponsor, outgoingKoin = '0' } = params;
  const reserved = resourceValue((await provider.call<{ rc?: string }>('mempool.get_reserved_account_rc', { account: payer })).rc);
  let available: bigint;
  let cap = UINT64_MAX;
  if (payer === sponsor) {
    const status = await readIntegers(provider, payer, 0x72cdbfdd);
    const limit = (await readIntegers(provider, payer, 0xc42b62f8)).get(1) ?? 0n;
    const mana = status.get(4) ?? 0n;
    const balance = status.get(5) ?? 0n;
    available = mana < balance ? mana : balance;
    cap = limit > 0n ? limit - 1n : 0n;
  } else {
    const mana = resourceValue((await provider.call<{ rc?: string }>('chain.get_account_rc', { account: payer })).rc);
    const args = protobuf.Writer.create().uint32(10).bytes(utils.decodeBase58(payer)).finish();
    const balance = (await readIntegers(provider, koinContract, 0x5c721497, utils.encodeBase64url(args))).get(1) ?? 0n;
    available = mana < balance ? mana : balance;
  }
  available -= reserved + resourceValue(outgoingKoin);
  if (available < 0n) available = 0n;
  return (available < cap ? available : cap).toString();
}

export function assertManaCapacity(limit: string, capacity: string): void {
  if (BigInt(validateRcLimit(limit)) > BigInt(capacity)) {
    throw new Error(`The selected payer has ${formatMana(capacity)} mana available. Lower the maximum mana or choose another payer.`);
  }
}
