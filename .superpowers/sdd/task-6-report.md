# Task 6 Report: Token Management And Portfolio Values

## What changed

- Added a new network-scoped custom token store in `src/stores/customTokenStore.ts`.
- Added RED/GREEN coverage for the custom token store in `src/stores/__tests__/customTokenStore.test.ts`.
- Added a cached token pricing service in `src/lib/tokenPrices.ts` that:
  - fetches KOIN USD pricing,
  - derives token USD values from the existing KoinDX quote path,
  - skips zero-balance tokens,
  - degrades gracefully when price data is missing or failing.
- Added RED/GREEN coverage for the pricing service in `src/lib/__tests__/tokenPrices.test.ts`.
- Updated `src/stores/tokenStore.ts` to:
  - merge system tokens with per-network custom tokens,
  - hide system tokens without removing them,
  - keep `allTokens` for balance refresh/detail lookups,
  - expose `tokens` as the visible token list,
  - preserve Task 2 network-scope guards.
- Added `src/screens/TokenManagementScreen.tsx` for:
  - adding custom tokens,
  - hiding/showing system tokens,
  - removing custom tokens.
- Added navigation to the token management screen from Settings.
- Added Home portfolio USD display that only renders when price data exists.
- Added a Home screen regression test covering the portfolio USD behavior.

## TDD Evidence

### RED

Custom token store:

Command:

```bash
npm test -- src/stores/__tests__/customTokenStore.test.ts --runInBand
```

Output:

```text
FAIL src/stores/__tests__/customTokenStore.test.ts
  Test suite failed to run
  Cannot find module '../customTokenStore'
```

Expected failure:
- The test referenced the not-yet-created custom token store module.

Token prices:

Command:

```bash
npm test -- src/lib/__tests__/tokenPrices.test.ts --runInBand
```

Output:

```text
FAIL src/lib/__tests__/tokenPrices.test.ts
  Test suite failed to run
  Cannot find module '../tokenPrices'
```

Expected failure:
- The test referenced the not-yet-created token pricing module.

### GREEN

Command:

```bash
npm test -- src/stores/__tests__/customTokenStore.test.ts src/lib/__tests__/tokenPrices.test.ts src/screens/__tests__/HomeScreen.test.tsx --runInBand
```

Output:

```text
PASS src/screens/__tests__/HomeScreen.test.tsx
PASS src/lib/__tests__/tokenPrices.test.ts
PASS src/stores/__tests__/customTokenStore.test.ts

Test Suites: 3 passed, 3 total
Tests:       12 passed, 12 total
```

## Verification commands and results

1. Focused RED:

```bash
npm test -- src/stores/__tests__/customTokenStore.test.ts --runInBand
```

- Result: failed as expected with missing-module error before implementation.

2. Focused RED:

```bash
npm test -- src/lib/__tests__/tokenPrices.test.ts --runInBand
```

- Result: failed as expected with missing-module error before implementation.

3. Focused GREEN:

```bash
npm test -- src/stores/__tests__/customTokenStore.test.ts src/lib/__tests__/tokenPrices.test.ts src/screens/__tests__/HomeScreen.test.tsx --runInBand
```

- Result: passed, 3 suites / 12 tests.

4. Typecheck:

```bash
npx tsc --noEmit
```

- Result: passed.

5. Full suite:

```bash
npm test -- --runInBand
```

- Result: passed, 35 suites / 266 tests.

6. React Doctor:

```bash
npx -y react-doctor@latest . --verbose --diff
```

- Result: exited non-zero because of existing repo-wide diagnostics, mostly outside this task.
- Notable task-adjacent output: Home screen warnings about async/effect structure, but no failing Jest or TypeScript verification remained.

## Files changed

- `src/stores/customTokenStore.ts`
- `src/stores/__tests__/customTokenStore.test.ts`
- `src/lib/tokenPrices.ts`
- `src/lib/__tests__/tokenPrices.test.ts`
- `src/screens/TokenManagementScreen.tsx`
- `src/stores/tokenStore.ts`
- `src/screens/HomeScreen.tsx`
- `src/screens/SettingsScreen.tsx`
- `src/navigation/TabNavigator.tsx`
- `src/screens/__tests__/HomeScreen.test.tsx`

## Self-review findings

- Network scoping is preserved by reusing the existing `cacheKey`/`networkMode:address` pattern from Task 2.
- Hidden system tokens stay in `allTokens`, so unhide works without refetching the token list.
- Custom tokens are network-local and refresh balances through the existing token balance path.
- Portfolio pricing does not block token or KOIN balance display; failures resolve to `null` portfolio value instead of throwing into the Home screen.
- Native swap baseline remains on the existing token/quote stack; pricing reuses the existing KoinDX quote helper instead of adding a second token quote source.

## Concerns

- React Doctor still reports existing repo-wide issues and a few Home-screen warnings. They were not introduced as test/type failures, but they remain unresolved in this task because broad cleanup would exceed Task 6 scope.
- Custom token entry is manual (contract, symbol, name, decimals, optional icon). There is no metadata auto-discovery flow in this task.

## Review Fix Report

### Findings addressed

- Kept `tokenStore.tokens` as the canonical active-scope token set so hidden system tokens remain available to send/swap consumers.
- Moved hide filtering to Home-specific UI handling so hidden system tokens stay off intended visible surfaces without acting like removals.
- Removed the extra Home-screen portfolio pricing path and now price only once after the visible active-scope token balances finish settling.
- Added regression coverage proving hidden system tokens stay available to swap consumers and that Home pricing ignores hidden tokens while running once per settled refresh.

### Verification

1. Focused regression suite:

```bash
npm test -- src/stores/__tests__/customTokenStore.test.ts src/stores/__tests__/tokenStore.test.ts src/screens/__tests__/HomeScreen.test.tsx src/hooks/__tests__/useNativeSwap.test.ts --runInBand
```

- Result: passed, 4 suites / 26 tests.

2. Typecheck:

```bash
npx tsc --noEmit
```

- Result: passed.

3. Full suite:

```bash
npm test -- --runInBand
```

- Result: passed, 35 suites / 269 tests.
