# Network Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add mobile network health checks and prevent normal switching to unreachable networks.

**Architecture:** Create a focused health service under `src/services/networkHealth.ts` and consume it from `NetworkSettingsScreen`. Keep persisted network selection in `networkStore`; health is volatile UI state.

**Tech Stack:** React Native, Expo, TypeScript, Jest, `react-test-renderer`, existing Koinos network constants.

## Global Constraints

- Keep user-facing copy plain and avoid endpoint jargon.
- Do not persist health results.
- Do not add dependencies.
- Use TDD for the health service and screen behavior.

---

### Task 1: Network Health Service

**Files:**
- Create: `src/services/networkHealth.ts`
- Create: `src/services/__tests__/networkHealth.test.ts`

**Interfaces:**
- Produces: `checkNetworkNodeHealth(url, options): Promise<NetworkNodeHealth>`
- Produces: `summarizeNetworkHealth(nodes): NetworkHealthSummary`
- Produces: `checkNetworkHealth(urls, options): Promise<{ nodes; summary }>`

- [x] **Step 1: Write failing tests**

Add tests for online JSON-RPC response, slow response, non-JSON response, JSON-RPC error, timeout, and summary aggregation.

- [x] **Step 2: Run targeted test and verify red**

Run: `npx jest src/services/__tests__/networkHealth.test.ts --runInBand`

Expected: fail because `src/services/networkHealth.ts` does not exist.

- [x] **Step 3: Implement service**

Implement the RPC health check using `fetch`, `AbortController`, content-type validation, and `chain.get_head_info`.

- [x] **Step 4: Run targeted test and verify green**

Run: `npx jest src/services/__tests__/networkHealth.test.ts --runInBand`

Expected: pass.

### Task 2: Network Settings Health UI

**Files:**
- Modify: `src/screens/NetworkSettingsScreen.tsx`
- Modify: `src/screens/__tests__/NetworkSettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `checkNetworkHealth` from `src/services/networkHealth.ts`.
- Produces: screen copy and switch gating for online, degraded, unavailable, loading, and refresh states.

- [x] **Step 1: Write failing screen tests**

Add tests that mocked health statuses render in the screen, unavailable Harbinger blocks normal switching, and online Harbinger still asks confirmation then switches.

- [x] **Step 2: Run targeted test and verify red**

Run: `npx jest src/screens/__tests__/NetworkSettingsScreen.test.tsx --runInBand`

Expected: fail because health UI and gating are not implemented.

- [x] **Step 3: Implement screen behavior**

Load both network health summaries on mount, render a health section, add refresh, and check target health before switch confirmation.

- [x] **Step 4: Run targeted test and verify green**

Run: `npx jest src/screens/__tests__/NetworkSettingsScreen.test.tsx --runInBand`

Expected: pass.

### Task 3: Verification

**Files:**
- Verify changed files only plus full project checks.

- [x] **Step 1: Typecheck**

Run: `npx tsc --noEmit`

Expected: exit 0.

- [x] **Step 2: Targeted tests**

Run: `npx jest src/services/__tests__/networkHealth.test.ts src/screens/__tests__/NetworkSettingsScreen.test.tsx --runInBand`

Expected: pass.

- [x] **Step 3: Full tests**

Run: `npx jest --runInBand`

Expected: pass.

- [x] **Step 4: React Doctor**

Run: `npx -y react-doctor@latest . --verbose --diff`

Expected: no new critical issue in changed code.
