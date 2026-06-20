# Task 7 Report: NFT Collectibles

## What changed

- Added `src/lib/nftService.ts` with:
  - known mainnet NFT collection list
  - injectable contract and metadata fetch boundaries for tests
  - mainnet-only `fetchNFTsByOwner`
  - metadata normalization and IPFS URL conversion helpers
  - collection grouping helpers and NFT display helpers
- Added `src/lib/__tests__/nftService.test.ts` covering:
  - owned NFT lookup
  - metadata normalization
  - IPFS URL conversion
  - empty owner short-circuit
  - unsupported Harbinger short-circuit
- Added `src/hooks/useNFTs.ts` to bind wallet address, network state, provider initialization, loading/error state, and refetch behavior.
- Replaced the Collectibles placeholder screen with:
  - loading, empty, error, and Harbinger unsupported states
  - grouped collection sections
  - 2-column NFT grid rows
  - pull-to-refresh
  - navigation into NFT detail
- Added `src/screens/NFTDetailScreen.tsx` for NFT image, description, traits, token id, owner, contract copy actions, and explorer navigation.
- Updated `src/navigation/TabNavigator.tsx` to add a collectibles stack with `CollectiblesMain` and `NFTDetail`.

## TDD Evidence

### RED

Command:

```bash
npm test -- src/lib/__tests__/nftService.test.ts --runInBand
```

Expected failure:
- service module missing before implementation

Observed output:

```text
FAIL src/lib/__tests__/nftService.test.ts
  ● Test suite failed to run

    Cannot find module '../nftService' from 'src/lib/__tests__/nftService.test.ts'
```

### GREEN

Command:

```bash
npm test -- src/lib/__tests__/nftService.test.ts --runInBand
```

Observed output:

```text
PASS src/lib/__tests__/nftService.test.ts
Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
```

## Verification commands and results

1. Focused NFT service test

```bash
npm test -- src/lib/__tests__/nftService.test.ts --runInBand
```

Result:
- PASS
- 1 suite passed
- 11 tests passed

2. Type check

```bash
npx tsc --noEmit
```

Result:
- PASS
- exited 0 with no TypeScript errors

3. Full Jest suite

```bash
npm test -- --runInBand
```

Result:
- PASS
- 36 suites passed
- 282 tests passed
- 2 snapshots passed

4. React Doctor changed-scope scan

```bash
npx -y react-doctor@latest . --verbose --scope changed
```

Result:
- exited 1
- changed-scope branch still contains pre-existing React Doctor findings outside this task
- Task 7-specific hard failure from array index keys was fixed before final verification
- remaining Task 7 warnings are low-risk (`react-native` `Image` caching preference and JSX element prop warning in `CollectiblesScreen.tsx`)

## Files changed

- `.superpowers/sdd/task-7-report.md`
- `src/lib/nftService.ts`
- `src/lib/__tests__/nftService.test.ts`
- `src/hooks/useNFTs.ts`
- `src/screens/CollectiblesScreen.tsx`
- `src/screens/NFTDetailScreen.tsx`
- `src/navigation/TabNavigator.tsx`

## Self-review findings

- Mainnet-only gating works at both service and hook layers, so Harbinger does not fetch NFTs and the UI shows an unsupported state instead.
- The service is testable without live network access because contract reads and metadata fetches are injectable.
- Navigation is scoped to the collectibles tab via a nested stack, which keeps NFT detail routing isolated from the home stack.
- I did not find blocking test or type issues after final verification.

## Concerns

- React Doctor still reports branch-scope findings from earlier task work outside this task.
- `CollectiblesScreen.tsx` still has two non-blocking React Doctor warnings: `react-native` `Image` preference and JSX element prop memoization preference.

## Review Fix Addendum

### Findings addressed

1. Critical: `src/hooks/useNFTs.ts` now guards async writes with a per-request token plus `address:networkMode` scope key, so late mainnet/account responses are ignored after the user switches network or account.
2. Important: `src/lib/nftService.ts` now follows the NFT contract paging API via `getTokensByOwner({ owner, start, limit })` and keeps reading past the first 50 owned NFTs instead of silently truncating collection results.

### Regression coverage

- Extended `src/lib/__tests__/nftService.test.ts` to prove multi-page owner reads continue past the first 50 token IDs.
- Added `src/hooks/__tests__/useNFTs.test.tsx` to prove stale in-flight results are ignored after:
  - switching from mainnet to Harbinger
  - switching from one account to another

### Verification

1. Focused NFT service regression

```bash
npm test -- src/lib/__tests__/nftService.test.ts --runInBand
```

Result:
- PASS
- 1 suite passed
- 12 tests passed

2. Focused hook regression

```bash
npm test -- src/hooks/__tests__/useNFTs.test.tsx --runInBand
```

Result:
- PASS
- 1 suite passed
- 2 tests passed

3. Type check

```bash
npx tsc --noEmit
```

Result:
- PASS
- exited 0 with no TypeScript errors

4. Full Jest suite

```bash
npm test -- --runInBand
```

Result:
- PASS
- 37 suites passed
- 285 tests passed
- 2 snapshots passed
