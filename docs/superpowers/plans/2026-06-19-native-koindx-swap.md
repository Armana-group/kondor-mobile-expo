# Native KoinDX Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native in-wallet KoinDX swap flow in Kondor Mobile, replacing the placeholder Swap tab with quote, review, sign, broadcast, and balance refresh behavior.

**Architecture:** Port Kondor3's KoinDX contract behavior, not its browser-extension plumbing. Use focused React Native-safe libraries: manual protobuf codecs for KoinDX/token operations, provider-backed quote and execution services, a small swap orchestration hook, and a native `SwapScreen`. Keep the user's account as transaction payer for KoinDX swaps because Kondor3 tests show KoinDX swaps are incompatible with free-mana payer rewriting.

**Tech Stack:** React Native 0.81.5, Expo SDK 54, TypeScript, Zustand, koilib, protobufjs/minimal, Expo SecureStore/LocalAuthentication, Jest.

## Global Constraints

- Work on branch `feature/native-koindx-swap`.
- Default branch remains `master`; never create or use `main`.
- Automated tests must not broadcast real mainnet transactions.
- Native swap v1 supports direct KoinDX pairs only; no multi-hop route finder.
- KoinDX periphery contract is `17e1q6Fh5RgnuA8K7v4KvXXH4k9qHgsT5s`.
- KoinDX `swap_tokens_in` entry point is `0x8b35a506`.
- KoinDX quote read methods are `get_pair` `0xefdc45c1`, pair `get_reserves` `0x6d0c5abf`, and periphery `get_amount_out` `0x2184ef25`.
- KOIN and VHP may be sent to KoinDX as route identifiers `koin` and `vhp`; token approvals must use real token contract IDs.
- Do not port Kondor3's browser `newSandboxSerializer`; React Native uses manual protobuf codecs for this feature.
- Do not cache private keys or signer instances beyond a single swap execution.
- Every non-read signing path requires biometric authentication.
- Preserve existing dynamic RC estimation behavior; do not copy Kondor3 hardcoded RC limits.
- A non-zero input with `amount_out_min` equal to zero must fail before signing.
- Test commands are `npm test -- --runInBand` and `npx tsc --noEmit`.

---

## File Structure

- Create `src/lib/swapMath.ts`
  - Decimal amount parsing/formatting, min-output calculation, token identifier helpers, and swap-specific errors.
- Create `src/lib/__tests__/swapMath.test.ts`
  - Unit coverage for precision, min-output, identifier mapping, and zero-min-output protection.
- Create `src/lib/koindxCodec.ts`
  - Manual protobuf encoders/decoders for KoinDX quote calls, KoinDX swap args, token approve args, pair reserves, and pair address results.
- Create `src/lib/__tests__/koindxCodec.test.ts`
  - Round-trip and known-tag tests for every manual protobuf message used by swap quote/execution.
- Create `src/lib/swapQuote.ts`
  - Provider-backed KoinDX quote service with pair cache, quote cache, direct routes, reserve handling, and slippage-aware `SwapQuote`.
- Create `src/lib/__tests__/swapQuote.test.ts`
  - Mock-provider tests for pair lookup, reserve ordering, amount-out calls, cache behavior, and user-facing errors.
- Create `src/lib/swapTransaction.ts`
  - Builds and executes a transaction containing token `approve` plus KoinDX `swap_tokens_in`; dry-runs before signing and broadcasting.
- Create `src/lib/__tests__/swapTransaction.test.ts`
  - Transaction-builder tests proving approve precedes swap, payer is the wallet, free-mana rewriting is not used, and zero min output fails closed.
- Create `src/hooks/useNativeSwap.ts`
  - Pure controller plus React hook that coordinates selected tokens, amount input, debounced quote refresh, slippage, quote expiry, execution status, and balance refresh.
- Create `src/hooks/__tests__/useNativeSwap.test.ts`
  - Pure controller unit tests with mocked services for quote refresh, invalid pairs, expired quotes, and successful execution state transitions.
- Modify `src/screens/SwapScreen.tsx`
  - Replace placeholder UI with native swap controls, token picker modal, quote details, slippage settings, confirmation, progress, success, and failure states.
- Create: `src/lib/transactionDecoder.ts`
  - Shared decoder helpers for current token and KoinDX operation labels.
- Create: `src/lib/__tests__/transactionDecoder.test.ts`
  - Unit tests for token approve, KoinDX swap, and unknown operation fallback.
- Modify `src/components/TransactionApprovalModal.tsx`
  - Use `src/lib/transactionDecoder.ts` for dApp/WalletConnect transaction review, including `0x8b35a506` and the current periphery contract.
- Modify `src/lib/constants.ts`
  - Add KoinDX constants next to network constants so services and UI share one source of truth.
- Modify `docs/development/progress.md`
  - Record the native swap implementation and verification state after implementation passes.

---

### Task 1: Branch and Baseline Verification

**Files:**
- Read: `package.json`
- Read: `tsconfig.json`
- Read: `jest.setup.ts`

**Interfaces:**
- Consumes: clean checkout on `feature/native-koindx-swap`
- Produces: verified baseline before feature work

- [ ] **Step 1: Confirm branch and status**

Run:

```bash
git status --short --branch
```

Expected:

```text
## feature/native-koindx-swap
?? docs/superpowers/
```

The only allowed uncommitted path at this point is this plan.

- [ ] **Step 2: Run full current unit tests**

Run:

```bash
npm test -- --runInBand
```

Expected: existing test suites pass before swap implementation begins.

- [ ] **Step 3: Run type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no new type errors from the branch baseline. If existing type errors appear, capture the exact files and decide whether they block swap work before editing feature files.

- [ ] **Step 4: Commit the plan**

Run:

```bash
git add docs/superpowers/plans/2026-06-19-native-koindx-swap.md
git commit -m "docs: plan native koindx swap"
```

Expected: plan is committed before implementation tasks begin.

---

### Task 2: Swap Math and Token Identifier Helpers

**Files:**
- Create: `src/lib/swapMath.ts`
- Create: `src/lib/__tests__/swapMath.test.ts`

**Interfaces:**
- Consumes: mobile `Token` shape from `src/stores/tokenStore.ts`
- Produces:
  - `SwapErrorCode`
  - `SwapError`
  - `SwapToken`
  - `parseDecimalAmount(amount: string, decimals: number): string`
  - `formatBaseUnits(value: string, decimals: number): string`
  - `calculateMinOutput(amountOut: string, slippagePercent: number, outputDecimals: number): string`
  - `assertProtectedMinOutput(amountInBaseUnits: string, amountOutMinBaseUnits: string): void`
  - `toKoinDxIdentifier(token: Pick<SwapToken, "contractId" | "symbol">): string`
  - `resolveApproveContractId(identifier: string, tokens: SwapToken[]): string`
  - `buildDirectRoute(tokenIn: SwapToken, tokenOut: SwapToken): string[]`

- [ ] **Step 1: Write failing tests for amount math and route identifiers**

Create `src/lib/__tests__/swapMath.test.ts`:

```typescript
import {
  SwapError,
  assertProtectedMinOutput,
  buildDirectRoute,
  calculateMinOutput,
  formatBaseUnits,
  parseDecimalAmount,
  resolveApproveContractId,
  toKoinDxIdentifier,
  type SwapToken,
} from '../swapMath';

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

const token18: SwapToken = {
  contractId: '1TokenWith18Decimals',
  symbol: 'TOK',
  name: 'Token',
  decimals: 18,
  icon: '',
  balance: '0',
};

describe('swapMath', () => {
  it('parses and formats decimal amounts without float rounding', () => {
    expect(parseDecimalAmount('1', 8)).toBe('100000000');
    expect(parseDecimalAmount('1.23456789', 8)).toBe('123456789');
    expect(parseDecimalAmount('0.00000001', 8)).toBe('1');
    expect(formatBaseUnits('123456789', 8)).toBe('1.23456789');
    expect(formatBaseUnits('100000000', 8)).toBe('1');
  });

  it('rejects malformed or over-precision user amounts', () => {
    expect(() => parseDecimalAmount('', 8)).toThrow(SwapError);
    expect(() => parseDecimalAmount('abc', 8)).toThrow(SwapError);
    expect(() => parseDecimalAmount('-1', 8)).toThrow(SwapError);
    expect(() => parseDecimalAmount('1.000000001', 8)).toThrow(SwapError);
  });

  it('calculates min output at the output token precision', () => {
    expect(calculateMinOutput('0.9', 0.5, 8)).toBe('0.8955');
    expect(Number(calculateMinOutput('0.0000000005', 0.5, 18))).toBeGreaterThan(0);
    expect(calculateMinOutput('0.000000004', 0.5, 8)).toBe('0');
  });

  it('fails closed when a non-zero input has zero minimum output', () => {
    expect(() => assertProtectedMinOutput('1', '0')).toThrow(/slippage protection/i);
    expect(() => assertProtectedMinOutput('0', '0')).not.toThrow();
  });

  it('uses KoinDX nickname identifiers only for route path KOIN and VHP', () => {
    expect(toKoinDxIdentifier(koin)).toBe('koin');
    expect(toKoinDxIdentifier(vhp)).toBe('vhp');
    expect(toKoinDxIdentifier(token18)).toBe('1TokenWith18Decimals');
    expect(buildDirectRoute(koin, vhp)).toEqual(['koin', 'vhp']);
    expect(resolveApproveContractId('koin', [koin, vhp])).toBe(koin.contractId);
    expect(resolveApproveContractId('1TokenWith18Decimals', [token18])).toBe('1TokenWith18Decimals');
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/lib/__tests__/swapMath.test.ts --runInBand
```

Expected: FAIL because `src/lib/swapMath.ts` does not exist.

- [ ] **Step 3: Implement swap math helpers**

Create `src/lib/swapMath.ts` with these exported names and behavior:

```typescript
export type SwapErrorCode =
  | 'INVALID_AMOUNT'
  | 'INVALID_AMOUNT_PRECISION'
  | 'INVALID_SLIPPAGE'
  | 'SAME_TOKEN'
  | 'NO_PAIR'
  | 'NO_LIQUIDITY'
  | 'QUOTE_EXPIRED'
  | 'CONTRACT_ERROR'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_SLIPPAGE_FLOOR';

export class SwapError extends Error {
  constructor(message: string, public code: SwapErrorCode) {
    super(message);
    this.name = 'SwapError';
  }
}

export interface SwapToken {
  contractId: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  balance: string;
}
```

Implementation requirements:

- `parseDecimalAmount` trims whitespace and accepts only `digits` or `digits.fraction`.
- `parseDecimalAmount('0', decimals)` returns `'0'`; callers decide whether zero is allowed.
- If fractional digits exceed `decimals`, throw `new SwapError('Amount has too many decimal places', 'INVALID_AMOUNT_PRECISION')`.
- Use `BigInt`; do not use `parseFloat` for base-unit conversion.
- `calculateMinOutput` converts output amount to base units, applies `10000 - slippageBps`, floors integer division, and formats back to decimals.
- Slippage is valid from `0.01` through `50`; outside that range throws `INVALID_SLIPPAGE`.
- `toKoinDxIdentifier` returns `koin` for symbol `KOIN`, `vhp` for symbol `VHP`, otherwise `contractId`.
- `resolveApproveContractId` maps `koin` and `vhp` back to real token contract IDs from the token list.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- src/lib/__tests__/swapMath.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/swapMath.ts src/lib/__tests__/swapMath.test.ts
git commit -m "feat: add swap amount math"
```

---

### Task 3: Manual KoinDX Protobuf Codec

**Files:**
- Create: `src/lib/koindxCodec.ts`
- Create: `src/lib/__tests__/koindxCodec.test.ts`

**Interfaces:**
- Consumes:
  - `SwapToken` from `src/lib/swapMath.ts`
  - `utils.decodeBase58`, `utils.encodeBase58`, `utils.encodeBase64url`, `utils.decodeBase64url` from `koilib`
- Produces:
  - `encodeGetPairArgs(tokenA: string, tokenB: string): string`
  - `decodeGetPairResult(base64url: string): string | null`
  - `encodeGetReservesArgs(): string`
  - `decodeGetReservesResult(base64url: string): { reserveA: string; reserveB: string }`
  - `encodeGetAmountOutArgs(amountIn: string, reserveIn: string, reserveOut: string): string`
  - `decodeUint64Result(base64url: string): string | null`
  - `encodeApproveArgs(owner: string, spender: string, value: string): string`
  - `encodeSwapTokensInArgs(args: SwapTokensInArgs): string`
  - `SwapTokensInArgs`

- [ ] **Step 1: Write failing codec tests**

Create `src/lib/__tests__/koindxCodec.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/lib/__tests__/koindxCodec.test.ts --runInBand
```

Expected: FAIL because `src/lib/koindxCodec.ts` does not exist.

- [ ] **Step 3: Implement codec functions**

Create `src/lib/koindxCodec.ts` using `protobufjs/minimal` and `koilib` utilities. Use these field tags exactly:

```typescript
export interface SwapTokensInArgs {
  from: string;
  receiver: string;
  amountIn: string;
  amountOutMin: string;
  path: string[];
}
```

Encoding map:

- `get_pair_arguments`: `tokenA` string field 1, `tokenB` string field 2.
- `get_reserves` empty args: encode an empty `Uint8Array`.
- `get_amount_out_arguments`: `amount_in` uint64 field 1, `reserve_a` uint64 field 2, `reserve_b` uint64 field 3.
- `approve_args`: `owner` bytes field 1, `spender` bytes field 2, `value` uint64 field 3.
- `swap_tokens_in_arguments`: `from` bytes field 1, `receiver` bytes field 2, `amount_in` uint64 field 3, `amount_out_min` uint64 field 4, repeated `path` string field 5.

Decoding map:

- `get_pair_result`: read field 1 bytes and convert with `utils.encodeBase58`.
- `get_reserves_result`: read field 2 as `reserveA`, field 3 as `reserveB`; skip fields 1 and 4.
- `uint64_result`: read field 1 as decimal string.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- src/lib/__tests__/koindxCodec.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/koindxCodec.ts src/lib/__tests__/koindxCodec.test.ts
git commit -m "feat: add koindx protobuf codec"
```

---

### Task 4: KoinDX Constants

**Files:**
- Modify: `src/lib/constants.ts`
- Test: `src/lib/__tests__/swapQuote.test.ts` in Task 5

**Interfaces:**
- Produces:
  - `KOINDX.PERIPHERY_CONTRACT`
  - `KOINDX.FREE_MANA_SHARER`
  - `KOINDX.ENTRY_POINTS.GET_PAIR`
  - `KOINDX.ENTRY_POINTS.GET_AMOUNT_OUT`
  - `KOINDX.ENTRY_POINTS.GET_RESERVES`
  - `KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN`
  - `KOINDX.SWAP_FEE`
  - `KOINDX.QUOTE_CACHE_MS`
  - `KOINDX.PAIR_CACHE_MS`
  - `KOINDX.QUOTE_EXPIRY_MS`

- [ ] **Step 1: Add shared constants**

Modify `src/lib/constants.ts`:

```typescript
export const KOINDX = {
  PERIPHERY_CONTRACT: '17e1q6Fh5RgnuA8K7v4KvXXH4k9qHgsT5s',
  FREE_MANA_SHARER: FREE_MANA_SHARER.mainnet,
  SWAP_FEE: 0.0025,
  QUOTE_CACHE_MS: 30 * 1000,
  PAIR_CACHE_MS: 5 * 60 * 1000,
  QUOTE_EXPIRY_MS: 60 * 1000,
  ENTRY_POINTS: {
    GET_PAIR: 0xefdc45c1,
    GET_AMOUNT_OUT: 0x2184ef25,
    GET_RESERVES: 0x6d0c5abf,
    SWAP_TOKENS_IN: 0x8b35a506,
    TOKEN_APPROVE: 0x74e21680,
  },
} as const;
```

- [ ] **Step 2: Run type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add src/lib/constants.ts
git commit -m "feat: add koindx contract constants"
```

---

### Task 5: KoinDX Quote Service

**Files:**
- Create: `src/lib/swapQuote.ts`
- Create: `src/lib/__tests__/swapQuote.test.ts`

**Interfaces:**
- Consumes:
  - `KOINDX` from `src/lib/constants.ts`
  - codecs from `src/lib/koindxCodec.ts`
  - math helpers from `src/lib/swapMath.ts`
- Produces:
  - `SwapQuote`
  - `SwapQuoteParams`
  - `KoinDxSwapQuoteService`
  - `swapQuoteService`

- [ ] **Step 1: Write failing quote-service tests**

Create `src/lib/__tests__/swapQuote.test.ts`:

```typescript
import { Provider } from 'koilib';
import { KOINDX } from '../constants';
import { KoinDxSwapQuoteService } from '../swapQuote';
import type { SwapToken } from '../swapMath';

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

describe('KoinDxSwapQuoteService', () => {
  it('gets a direct quote from pair, reserves, and amount_out calls', async () => {
    const call = jest.fn(async (_method: string, params: any) => {
      if (params.contract_id === KOINDX.PERIPHERY_CONTRACT && params.entry_point === KOINDX.ENTRY_POINTS.GET_PAIR) {
        return { result: 'encoded-pair-address' };
      }
      if (params.contract_id === '17PairAddress' && params.entry_point === KOINDX.ENTRY_POINTS.GET_RESERVES) {
        return { result: 'encoded-reserves' };
      }
      if (params.contract_id === KOINDX.PERIPHERY_CONTRACT && params.entry_point === KOINDX.ENTRY_POINTS.GET_AMOUNT_OUT) {
        return { result: 'encoded-amount-out' };
      }
      throw new Error(`unexpected call ${params.contract_id}:${params.entry_point}`);
    });

    const service = new KoinDxSwapQuoteService({
      now: () => 1_000,
      decodeGetPairResult: () => '17PairAddress',
      decodeGetReservesResult: () => ({ reserveA: '1000000000', reserveB: '500000000' }),
      decodeUint64Result: () => '45000000',
    });

    const quote = await service.getSwapQuote({
      provider: { call } as unknown as Provider,
      tokenIn: koin,
      tokenOut: vhp,
      amountIn: '1',
      slippagePercent: 0.5,
      allTokens: [koin, vhp],
    });

    expect(quote.amountIn).toBe('1');
    expect(quote.amountInBaseUnits).toBe('100000000');
    expect(quote.amountOut).toBe('0.45');
    expect(quote.amountOutMin).toBe('0.44775');
    expect(quote.amountOutMinBaseUnits).toBe('44775000');
    expect(quote.route).toEqual(['koin', 'vhp']);
    expect(quote.expiresAt).toBe(61_000);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('rejects same-token swaps before network calls', async () => {
    const call = jest.fn();
    const service = new KoinDxSwapQuoteService();
    await expect(service.getSwapQuote({
      provider: { call } as unknown as Provider,
      tokenIn: koin,
      tokenOut: koin,
      amountIn: '1',
      slippagePercent: 0.5,
      allTokens: [koin, vhp],
    })).rejects.toThrow(/same token/i);
    expect(call).not.toHaveBeenCalled();
  });

  it('returns cached quotes for repeated requests inside cache duration', async () => {
    const call = jest.fn(async (_method: string, params: any) => {
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_PAIR) return { result: 'encoded-pair-address' };
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_RESERVES) return { result: 'encoded-reserves' };
      if (params.entry_point === KOINDX.ENTRY_POINTS.GET_AMOUNT_OUT) return { result: 'encoded-amount-out' };
      return {};
    });
    const service = new KoinDxSwapQuoteService({
      now: () => 1_000,
      decodeGetPairResult: () => '17PairAddress',
      decodeGetReservesResult: () => ({ reserveA: '1000000000', reserveB: '500000000' }),
      decodeUint64Result: () => '45000000',
    });
    const params = {
      provider: { call } as unknown as Provider,
      tokenIn: koin,
      tokenOut: vhp,
      amountIn: '1',
      slippagePercent: 0.5,
      allTokens: [koin, vhp],
    };

    const first = await service.getSwapQuote(params);
    const second = await service.getSwapQuote(params);

    expect(second).toEqual(first);
    expect(call).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/lib/__tests__/swapQuote.test.ts --runInBand
```

Expected: FAIL because `src/lib/swapQuote.ts` does not exist.

- [ ] **Step 3: Implement quote service**

Create `src/lib/swapQuote.ts` with:

```typescript
export interface SwapQuote {
  tokenInContractId: string;
  tokenOutContractId: string;
  amountIn: string;
  amountInBaseUnits: string;
  amountOut: string;
  amountOutBaseUnits: string;
  amountOutMin: string;
  amountOutMinBaseUnits: string;
  priceImpact: number;
  executionPrice: number;
  spotPrice: number;
  route: string[];
  pairAddress: string;
  fee: number;
  timestamp: number;
  expiresAt: number;
}

export interface SwapQuoteParams {
  provider: Provider;
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  amountIn: string;
  slippagePercent: number;
  allTokens: SwapToken[];
}
```

Implementation requirements:

- Use `provider.call('chain.read_contract', ...)` for all quote reads.
- Sort pair lookup by resolved real contract address but pass the matching KoinDX identifier.
- Cache pair addresses for `KOINDX.PAIR_CACHE_MS`.
- Cache quote results for `KOINDX.QUOTE_CACHE_MS`.
- Quote expires at `now + KOINDX.QUOTE_EXPIRY_MS`.
- Convert user amount with `parseDecimalAmount`.
- Convert result with `formatBaseUnits`.
- Compute min output with `calculateMinOutput`, then convert to base units.
- Throw `SwapError('No liquidity pool exists for this pair', 'NO_PAIR')` if pair result is missing.
- Throw `SwapError('No liquidity available for this pair', 'NO_LIQUIDITY')` if either reserve is zero.
- Direct routes only: `[toKoinDxIdentifier(tokenIn), toKoinDxIdentifier(tokenOut)]`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- src/lib/__tests__/swapQuote.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Run math, codec, and quote tests together**

Run:

```bash
npm test -- src/lib/__tests__/swapMath.test.ts src/lib/__tests__/koindxCodec.test.ts src/lib/__tests__/swapQuote.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/swapQuote.ts src/lib/__tests__/swapQuote.test.ts
git commit -m "feat: add koindx quote service"
```

---

### Task 6: Swap Transaction Builder and Executor

**Files:**
- Create: `src/lib/swapTransaction.ts`
- Create: `src/lib/__tests__/swapTransaction.test.ts`

**Interfaces:**
- Consumes:
  - `SwapQuote` from `src/lib/swapQuote.ts`
  - `SwapToken`, `assertProtectedMinOutput`, `resolveApproveContractId` from `src/lib/swapMath.ts`
  - `encodeApproveArgs`, `encodeSwapTokensInArgs` from `src/lib/koindxCodec.ts`
  - `dryRunRcLimit` from `src/lib/manaEstimation.ts`
- Produces:
  - `SwapExecutionStatus`
  - `SwapExecutionResult`
  - `SwapTransactionParams`
  - `buildSwapTransaction(params): Promise<Transaction>`
  - `executeSwapTransaction(params): Promise<SwapExecutionResult>`

- [ ] **Step 1: Write failing transaction tests**

Create `src/lib/__tests__/swapTransaction.test.ts`:

```typescript
import { Provider, Signer, Transaction } from 'koilib';
import { KOINDX } from '../constants';
import { buildSwapTransaction, executeSwapTransaction } from '../swapTransaction';
import type { SwapQuote } from '../swapQuote';
import type { SwapToken } from '../swapMath';

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
      this.send = jest.fn(async ({ broadcast } = { broadcast: true }) => ({
        id: broadcast ? '0xsent' : '0xdryrun',
        rc_used: '50000000',
        reverted: false,
      }));
      this.wait = jest.fn(async () => ({ blockNumber: 123 }));
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
  signTransaction: jest.fn(async () => undefined),
} as unknown as Signer;

describe('swapTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(tx.transaction.operations).toHaveLength(2);
    expect(tx.transaction.operations[0].call_contract.contract_id).toBe(koin.contractId);
    expect(tx.transaction.operations[0].call_contract.entry_point).toBe(KOINDX.ENTRY_POINTS.TOKEN_APPROVE);
    expect(tx.transaction.operations[1].call_contract.contract_id).toBe(KOINDX.PERIPHERY_CONTRACT);
    expect(tx.transaction.operations[1].call_contract.entry_point).toBe(KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN);
  });

  it('dry-runs before final signing and broadcast', async () => {
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
    expect(result.blockHeight).toBe(123);
    expect(Transaction).toHaveBeenCalledTimes(2);
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
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/lib/__tests__/swapTransaction.test.ts --runInBand
```

Expected: FAIL because `src/lib/swapTransaction.ts` does not exist.

- [ ] **Step 3: Implement transaction builder**

Create `src/lib/swapTransaction.ts`.

`buildSwapTransaction` requirements:

- Input params include `provider`, `signer`, `quote`, `tokenIn`, `tokenOut`, `allTokens`, `rcLimit`, and optional `receiverAddress`.
- `senderAddress = signer.getAddress()`.
- `receiverAddress` defaults to `senderAddress`.
- Call `assertProtectedMinOutput(quote.amountInBaseUnits, quote.amountOutMinBaseUnits)` before creating operations.
- Add token approve operation first:
  - contract ID: real token-in contract ID, resolving `koin` and `vhp` through `allTokens`
  - entry point: `KOINDX.ENTRY_POINTS.TOKEN_APPROVE`
  - args: `encodeApproveArgs(senderAddress, KOINDX.PERIPHERY_CONTRACT, quote.amountInBaseUnits)`
- Add swap operation second:
  - contract ID: `KOINDX.PERIPHERY_CONTRACT`
  - entry point: `KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN`
  - args: `encodeSwapTokensInArgs({ from: senderAddress, receiver: receiverAddress, amountIn: quote.amountInBaseUnits, amountOutMin: quote.amountOutMinBaseUnits, path: quote.route })`
- Transaction options:
  - `payer: senderAddress`
  - no `payee`
  - `rcLimit`

`executeSwapTransaction` requirements:

- Status order: `building`, `estimating_mana`, `signing`, `broadcasting`, `confirming`, `confirmed`.
- Build a dry-run transaction with `rcLimit = dryRunRcLimit({ maxRc, availableRc })`.
- Send dry-run with `{ broadcast: false }`.
- If dry-run `reverted`, throw a message beginning `Swap simulation failed:`.
- Final `rcLimit = Math.floor(Number(rc_used) * 1.1)`.
- Build final transaction with the final `rcLimit`.
- `await signer.signTransaction(tx.transaction)` before `tx.send({ broadcast: true })`.
- Wait for confirmation with `tx.wait()`.
- Return `{ transactionId, blockHeight, receipt }`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- src/lib/__tests__/swapTransaction.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Run all swap service tests**

Run:

```bash
npm test -- src/lib/__tests__/swapMath.test.ts src/lib/__tests__/koindxCodec.test.ts src/lib/__tests__/swapQuote.test.ts src/lib/__tests__/swapTransaction.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/swapTransaction.ts src/lib/__tests__/swapTransaction.test.ts
git commit -m "feat: add native koindx swap transaction builder"
```

---

### Task 7: Native Swap Hook

**Files:**
- Create: `src/hooks/useNativeSwap.ts`
- Create: `src/hooks/__tests__/useNativeSwap.test.ts`

**Interfaces:**
- Consumes:
  - `useWalletStore`
  - `useTokenStore`
  - `useKoinosStore`
  - `swapQuoteService`
  - `executeSwapTransaction`
- Produces:
  - `useNativeSwap()`
  - `NativeSwapStatus`

- [ ] **Step 1: Write failing hook tests**

Create `src/hooks/__tests__/useNativeSwap.test.ts` against a pure controller factory. The React hook will delegate to this controller, but these tests avoid adding a new hook-testing dependency. The tested exported factory must be:

```typescript
export function createNativeSwapController(deps: NativeSwapControllerDeps): NativeSwapController
```

Test behaviors:

```typescript
describe('createNativeSwapController', () => {
  it('does not request quotes for empty or zero amounts', async () => {
    const getSwapQuote = jest.fn();
    const controller = createNativeSwapController({
      getSwapQuote,
      executeSwapTransaction: jest.fn(),
      now: () => 1,
    });
    await controller.setAmount('');
    await controller.flushQuote();
    expect(getSwapQuote).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe('idle');
  });

  it('moves to ready after a quote resolves', async () => {
    const quote = { amountOut: '0.45', expiresAt: Date.now() + 60_000 };
    const controller = createNativeSwapController({
      getSwapQuote: jest.fn(async () => quote),
      executeSwapTransaction: jest.fn(),
      now: () => 1,
    });
    await controller.setAmount('1');
    await controller.flushQuote();
    expect(controller.getState().status).toBe('ready');
    expect(controller.getState().quote).toBe(quote);
  });

  it('rejects execution when the quote is expired', async () => {
    const controller = createNativeSwapController({
      getSwapQuote: jest.fn(async () => ({ amountOut: '0.45', expiresAt: 1 })),
      executeSwapTransaction: jest.fn(),
      now: () => 10,
    });
    await controller.setAmount('1');
    await controller.flushQuote();
    await expect(controller.execute()).rejects.toThrow(/expired/i);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/hooks/__tests__/useNativeSwap.test.ts --runInBand
```

Expected: FAIL because `src/hooks/useNativeSwap.ts` does not exist.

- [ ] **Step 3: Implement hook and controller**

Create `src/hooks/useNativeSwap.ts` with:

```typescript
export type NativeSwapStatus =
  | 'idle'
  | 'quoting'
  | 'ready'
  | 'confirming'
  | 'building'
  | 'signing'
  | 'broadcasting'
  | 'success'
  | 'error';
```

Hook requirements:

- Default input token: KOIN if present in `useTokenStore().tokens`, else first token.
- Default output token: VHP if present, else first token not equal to input.
- Slippage default: `0.5`.
- Quote debounce: `300ms`.
- Quote refresh uses the current `useKoinosStore().provider`; initialize the provider if needed.
- `canSwap` is true only when wallet exists, tokens differ, amount is positive, quote is valid, quote is not loading, and status is `ready`.
- `execute` fetches private key through `useWalletStore().getPrivateKey()`, creates a temporary `Signer`, fetches `getMana(address)` for `maxRc` and `availableRc`, executes the transaction, refreshes KOIN balance and both token balances, then clears amount/quote on success.
- The hook never stores plaintext private key in React state.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- src/hooks/__tests__/useNativeSwap.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/hooks/useNativeSwap.ts src/hooks/__tests__/useNativeSwap.test.ts
git commit -m "feat: add native swap state hook"
```

---

### Task 8: Native Swap Screen UI

**Files:**
- Modify: `src/screens/SwapScreen.tsx`

**Interfaces:**
- Consumes: `useNativeSwap`
- Produces: usable Swap tab for token selection, quote review, and execution

- [ ] **Step 1: Replace placeholder with functional screen**

Modify `src/screens/SwapScreen.tsx` to render:

- Header: `Swap`
- Pay panel:
  - amount input
  - token selector
  - available balance text
  - max button
- Direction button:
  - swaps pay/receive tokens and clears quote state
- Receive panel:
  - readonly amount from quote
  - token selector
- Quote detail panel when quote exists:
  - rate
  - minimum received
  - price impact
  - fee `0.25%`
  - quote expiration seconds
- Slippage row:
  - presets `0.1%`, `0.5%`, `1%`, `2%`
- Primary button states:
  - `Enter amount`
  - `Select different tokens`
  - `Fetching quote...`
  - `No liquidity for this pair`
  - `Review swap`
  - `Building transaction...`
  - `Signing...`
  - `Broadcasting...`
- Token picker modal:
  - uses current `tokens`
  - shows icon/fallback, symbol, name, balance
  - prevents selecting the same token on both sides by swapping sides
- Confirmation `Alert.alert`:
  - title `Review Swap`
  - body includes pay amount, receive amount, minimum received, route, and price impact
  - confirm text `Swap`
- Success `Alert.alert`:
  - title `Swap Submitted`
  - includes transaction ID

- [ ] **Step 2: Run type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run full unit tests**

Run:

```bash
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/screens/SwapScreen.tsx
git commit -m "feat: build native swap screen"
```

---

### Task 9: DApp Transaction Decoder Parity

**Files:**
- Create: `src/lib/transactionDecoder.ts`
- Create: `src/lib/__tests__/transactionDecoder.test.ts`
- Modify: `src/components/TransactionApprovalModal.tsx`

**Interfaces:**
- Consumes: `KOINDX` constants
- Produces:
  - `DecodedOperation`
  - `decodeKnownOperation(operation: OperationJson): DecodedOperation`
  - current KoinDX address/entry-point labels in dApp and WalletConnect approvals

- [ ] **Step 1: Write failing decoder tests**

Create `src/lib/__tests__/transactionDecoder.test.ts`:

```typescript
import {
  decodeKnownOperation,
} from '../transactionDecoder';
import { KOINDX } from '../constants';

describe('transactionDecoder', () => {
  it('labels token approve operations for KoinDX periphery', () => {
    const operation = decodeKnownOperation({
      call_contract: {
        contract_id: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
        entry_point: KOINDX.ENTRY_POINTS.TOKEN_APPROVE,
        args: 'encoded-approve',
      },
    });

    expect(operation.title).toBe('approve');
    expect(operation.details).toContainEqual({
      label: 'Entry Point',
      value: 'approve',
    });
  });

  it('labels current KoinDX swap_tokens_in operations', () => {
    const operation = decodeKnownOperation({
      call_contract: {
        contract_id: KOINDX.PERIPHERY_CONTRACT,
        entry_point: KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN,
        args: 'encoded-swap',
      },
    });

    expect(operation.title).toBe('swap_tokens_in');
    expect(operation.details).toContainEqual({
      label: 'Contract',
      value: 'KoinDX Periphery',
    });
  });

  it('keeps unknown operations explicit and inspectable', () => {
    const operation = decodeKnownOperation({
      call_contract: {
        contract_id: '1UnknownContract',
        entry_point: 123,
        args: 'opaque',
      },
    });

    expect(operation.title).toBe('0x7b');
    expect(operation.details).toContainEqual({
      label: 'Contract',
      value: '1UnknownContract',
    });
    expect(operation.details).toContainEqual({
      label: 'Arguments',
      value: 'opaque',
    });
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/lib/__tests__/transactionDecoder.test.ts --runInBand
```

Expected: FAIL because `src/lib/transactionDecoder.ts` does not exist.

- [ ] **Step 3: Create shared decoder module**

Create `src/lib/transactionDecoder.ts` by moving the decoder types and pure helper logic out of `TransactionApprovalModal.tsx`.

The module must include:

```typescript
import type { OperationJson } from 'koilib';
import { KOINDX } from './constants';

export interface DecodedOperation {
  type: 'contract_call' | 'upload_contract' | 'set_system_call' | 'set_system_contract';
  title: string;
  contractId: string;
  entryPoint?: number;
  details: { label: string; value: string }[];
}
```

Known contracts:

- `19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK`: `KOIN (KOIN)`
- `15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL`: `KOIN (KOIN)`
- `12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq`: `VHP (VHP)`
- `18tWNU7E4yuQzz7hMVpceb9ixmaWLVyQsr`: `VHP (VHP)`
- `KOINDX.PERIPHERY_CONTRACT`: `KoinDX Periphery`
- `1NHReq2apWsQ6UPBjNqcV3ABsj88Ncimiy`: `Kollection`

Known entry points:

- `0x27f576ca`: `transfer`
- `0x74e21680`: `approve`
- `0x5c721497`: `balanceOf`
- `0xe74b785a`: `balanceOfLegacy`
- `0xc65b2bae`: `totalSupply`
- `KOINDX.ENTRY_POINTS.SWAP_TOKENS_IN`: `swap_tokens_in`
- `0x82a3537f`: `mint`
- `0x859facc5`: `burn`
- `0x8f5a3e29`: `addLiquidity`
- `0x12b4a9c3`: `removeLiquidity`

- [ ] **Step 4: Use shared decoder in TransactionApprovalModal**

Modify `TransactionApprovalModal.tsx`:

- import `DecodedOperation` and `decodeKnownOperation` from `../lib/transactionDecoder`
- remove local `KNOWN_CONTRACTS`, `KNOWN_ENTRY_POINTS`, `decodeEntryPoint`, `decodeContract`, and `decodeOperations`
- replace the modal's decode effect with `transaction.operations.map(decodeKnownOperation)`
- preserve existing modal rendering and styling

- [ ] **Step 5: Run focused tests and type-check**

```bash
npm test -- src/lib/__tests__/transactionDecoder.test.ts --runInBand
```

Expected: PASS.

Always run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/TransactionApprovalModal.tsx src/lib/transactionDecoder.ts src/lib/__tests__/transactionDecoder.test.ts
git commit -m "fix: decode current koindx swap operations"
```

---

### Task 10: Local Verification, Mainnet-Safe Smoke, and Docs

**Files:**
- Modify: `docs/development/progress.md`
- Read: `STATUS.md`

**Interfaces:**
- Consumes: all implementation tasks
- Produces: verified branch with documented behavior and no accidental broadcast in automated tests

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run quote-only manual check**

Add a temporary local script only if needed, keep it uncommitted, and call `swapQuoteService.getSwapQuote` for a tiny KOIN to VHP quote using `broadcast: false` nowhere because quote calls are read-only.

Expected:

- pair lookup succeeds or returns a clear `NO_PAIR`
- no transaction is signed
- no transaction is broadcast

- [ ] **Step 4: Run simulator smoke without funded swap broadcast**

Run:

```bash
npm run ios
```

Manual checks:

- App launches.
- Swap tab is functional.
- KOIN and VHP default tokens appear.
- Entering an amount fetches or rejects a quote with a readable message.
- Switching tokens clears/refetches quote.
- Review dialog shows minimum received and route.
- Canceling review does not authenticate, sign, or broadcast.

- [ ] **Step 5: Optional low-value live swap**

Only perform this with explicit user approval in the live session and a low-value disposable funded wallet.

Manual checks:

- Biometric prompt appears after user confirms review.
- Transaction signs and broadcasts.
- Balances refresh after success.
- Transaction ID opens on Koinscan if copied into explorer.

- [ ] **Step 6: Update progress doc**

Append a short dated entry to `docs/development/progress.md`:

```markdown
## Session: 2026-06-19 (Native KoinDX Swap)

### Completed
- Added native KoinDX swap quote and execution plumbing.
- Replaced the placeholder Swap tab with token selection, quote review, slippage, biometric confirmation, and status feedback.
- Preserved mobile dynamic RC estimation and kept KoinDX swaps payer-owned rather than using free-mana payer rewriting.

### Verification
- `npm test -- --runInBand`
- `npx tsc --noEmit`
- iOS simulator quote/review smoke test
```

- [ ] **Step 7: Commit docs**

Run:

```bash
git add docs/development/progress.md
git commit -m "docs: record native koindx swap verification"
```

---

## Execution Order

1. Task 1 commits the plan and verifies baseline.
2. Task 2 creates precision-safe amount math.
3. Task 3 creates React Native-safe manual protobuf codecs.
4. Task 4 centralizes KoinDX constants.
5. Task 5 implements quote reads and caching.
6. Task 6 implements transaction build, dry-run, sign, broadcast, and wait.
7. Task 7 connects services to app state through a hook/controller.
8. Task 8 builds the native screen.
9. Task 9 aligns dApp/WalletConnect transaction decoding with current KoinDX.
10. Task 10 verifies, smokes, and documents.

## Risk Register

- **Codec risk:** Manual protobuf field definitions must match live KoinDX contracts. Mitigation: codec unit tests, quote-only live read, and no automated broadcast.
- **Mainnet risk:** Swap execution touches real assets. Mitigation: no automated broadcast, explicit approval before optional live swap, low-value disposable wallet.
- **Payer risk:** KoinDX swaps fail when payer is rewritten to free-mana sharer. Mitigation: transaction builder always uses wallet as payer and leaves payee unset.
- **Slippage risk:** Small outputs can round minimum output to zero. Mitigation: `assertProtectedMinOutput` fails before signing.
- **React Native serialization risk:** Browser iframe serializer cannot run in mobile. Mitigation: manual codecs using the same approach as `ManualTokenContract`.
- **Stale mana risk:** Current mobile dry-run helper already avoids stale available-RC caps. Mitigation: swap execution uses `dryRunRcLimit({ maxRc, availableRc })`.

## Self-Review

- Spec coverage: native quote, execution, UI, dApp decoder parity, tests, and manual verification are each mapped to a task.
- Placeholder scan: the plan avoids deferred placeholders and names exact files, functions, commands, constants, and expected outcomes.
- Type consistency: `SwapToken`, `SwapQuote`, `SwapQuoteParams`, `SwapExecutionResult`, and `NativeSwapStatus` are introduced before downstream tasks consume them.
