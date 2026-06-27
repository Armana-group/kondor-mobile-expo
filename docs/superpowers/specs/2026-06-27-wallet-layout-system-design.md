# Wallet Layout System Design

## Summary

Introduce a small HIG-informed layout foundation for Kondor Mobile so wallet screens feel consistent, polished, and easy to scan. The goal is not to copy Apple Settings or redesign the brand. The goal is to make Kondor's existing dark wallet UI feel deliberate through shared spacing, rows, cards, headers, control alignment, and text hierarchy.

This design starts with reusable primitives, then migrates the current Settings, Security & Privacy, and Send security-warning surfaces as the pilot.

## Goals

- Make spacing, row height, card shape, separator inset, and control alignment predictable across settings-like screens.
- Preserve Kondor's visual identity: graphite backgrounds, dark cards, purple accents, restrained warning/status colors.
- Apply Apple Human Interface Guidelines principles for clarity, consistency, legibility, adaptable layout, and comfortable touch targets.
- Reduce one-off screen-local values such as repeated `20`, `16`, `14`, `12`, and row-height constants where shared primitives are a better fit.
- Keep the first migration small enough to verify thoroughly.
- Leave the current send-biometric behavior intact while improving the layout system around it.

## Non-Goals

- Do not redesign the whole app in one pass.
- Do not clone Apple Settings visual styling.
- Do not change navigation structure, wallet flows, authentication behavior, send behavior, or persisted setting names.
- Do not introduce a third-party component library.
- Do not perform broad visual changes to Home, Activity, Browser, Token Detail, Collectibles, or WalletConnect screens in this first pass.
- Do not rename lower-level storage/service APIs such as `sendConfirmationRequired` as part of this UI system pass.

## Design Principles

### HIG-Informed, Kondor-Branded

Use Apple HIG as a product-quality reference for approachable layout, not as a brand template. Kondor should still feel like a crypto wallet: dark, secure, compact, and confident.

Relevant HIG guidance:

- Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Typography: https://developer.apple.com/design/human-interface-guidelines/typography

### Predictable Rhythm

Screens should share a small set of vertical and horizontal rhythms:

- screen gutter
- header padding
- card padding
- section gap
- row minimum height
- icon column width
- trailing value/control column width
- separator inset
- helper/warning text spacing

The app already has `spacing` and `borderRadius` tokens in `src/theme/colors.ts`. This pass should make those values easier to use consistently rather than scattering raw numbers through each screen.

### Rows Are Controls

Rows that navigate, toggle, reveal, copy, or select should feel related:

- stable minimum heights
- visible left icon area when used
- clear primary label
- optional helper text
- predictable trailing accessory, value, checkmark, switch, or chevron
- enough touch area for mobile use

### Cards Group Meaning

Cards should group related controls or explanations, not decorate isolated text. Card spacing should make the hierarchy obvious:

- screen -> section/card -> row -> label/helper -> trailing control

Warnings should be inline and specific, not large decorative blocks unless the risk is blocking or destructive.

## Architecture

### Theme Layout Tokens

Add a new `src/theme/layout.ts` module that exports stable layout values. Keep it simple and explicit:

- `screen.gutter`
- `screen.bottomPadding`
- `header.horizontalPadding`
- `header.topPadding`
- `header.bottomPadding`
- `header.sideButtonWidth`
- `card.padding`
- `card.radius`
- `section.gap`
- `row.minHeight`
- `row.tallMinHeight`
- `row.horizontalPadding`
- `row.iconSize`
- `row.iconColumnWidth`
- `row.accessoryGap`
- `row.controlColumnWidth`
- `separator.insetWithIcon`
- `text.helperTopMargin`
- `warning.gap`
- `warning.topPadding`

Do not over-tokenize. Add only values needed by the pilot screens.

### Shared UI Primitives

Add small primitives under `src/components/` or `src/components/settings/` if the folder keeps ownership clearer.

#### `AppHeader`

Responsibilities:

- Render a centered screen title with a left back button and matching right spacer.
- Use shared header spacing and side-button sizing.
- Preserve existing purple back chevron styling.
- Accept optional right content later, but do not build unused complexity now.

Dependencies:

- `react-native`
- `@expo/vector-icons`
- existing `colors`
- new `layout`

#### `InfoCard`

Responsibilities:

- Render a card with title and optional body.
- Use shared card padding/radius and title/body text styles.
- Support children for cards that need controls below the text.

Examples:

- Sensitive Wallet Data explainer.
- Transaction Authorization explainer plus options.

#### `SettingsSection`

Responsibilities:

- Render a grouped card-like section with optional uppercase title.
- Provide consistent card radius, overflow, and bottom spacing.
- Host `SettingsRow` children.

#### `SettingsRow`

Responsibilities:

- Render the common settings row pattern.
- Support optional icon, label, helper text, destructive color, trailing value, trailing accessory, switch/control node, checkmark, and chevron.
- Use a stable icon column and trailing area so labels and controls align across rows.
- Use `Pressable` and preserve pressed opacity.
- Set accessibility role when interactive.

This component should replace only settings-like rows in the pilot. It should not attempt to cover highly custom financial transaction rows yet.

#### `WarningInline`

Responsibilities:

- Render compact warning/status copy with icon, color, spacing, and line height.
- Use warning color by default and support error/success variants if needed by current pilot surfaces.

Examples:

- `Manual sends will skip device authentication.`
- `Send biometrics are off`

## Pilot Migration

### `SettingsScreen`

Move the screen from local layout definitions to the shared primitives:

- Replace local header with `AppHeader`.
- Replace section containers with `SettingsSection`.
- Replace mapped rows with `SettingsRow`.
- Preserve existing section labels and navigation targets.
- Keep the top-level Settings screen as a navigation index.
- Do not reintroduce the send biometric switch here.

Expected result: Settings should feel cleaner and more aligned without changing behavior.

### `SecurityPrivacyScreen`

Use shared primitives while preserving the active send-biometric UI direction:

- Replace local header with `AppHeader`.
- Render Sensitive Wallet Data using `InfoCard`.
- Render `Require biometrics for sends` using an `InfoCard` or `SettingsSection` plus a row/control layout that aligns the switch in a fixed trailing column.
- Render Transaction Authorization using `InfoCard` plus selectable rows or a small option-group style that reuses row layout values.
- Render recovery phrase/private key actions using `SettingsSection` and `SettingsRow`.
- Render the off-state send biometric warning using `WarningInline`.

Expected result: the current layout does not need to become perfect immediately, but its spacing and alignment should come from reusable rules.

### `SendScreen`

Keep the Send screen mostly unchanged in this pass:

- Use `WarningInline` for the existing `Send biometrics are off` warning if it can be done without broad SendScreen refactoring.
- Do not restructure the whole Send screen.
- Do not take on React Doctor warnings caused by the screen's existing size unless the touched warning can be extracted cleanly.

Expected result: the visible warning aligns with the same warning language and spacing used in Security & Privacy.

## Text And Copy

Use plain user-facing language:

- Prefer `biometrics` where the UI is specifically about device authentication before manual sends.
- Keep labels sentence case.
- Keep helper text short and concrete.
- Warnings should describe the user impact, not the implementation.

Approved pilot copy:

- Setting label: `Require biometrics for sends`
- Setting helper: `Manual sends ask for device authentication before broadcasting.`
- Off-state warning in Security & Privacy: `Manual sends will skip device authentication.`
- Off-state warning in Send: `Send biometrics are off`

## Data Flow

This pass should not change application state ownership:

- `SecurityPrivacyScreen` continues to read and write `sendConfirmationRequired` through existing auth service helpers.
- `SettingsScreen` remains a navigation index and does not own send biometric state.
- `SendScreen` continues to read the send-confirmation preference through its existing flow.
- New layout primitives are presentational and should not own wallet, network, or security state.

## Error Handling

No new error states are required for layout primitives.

Existing security preference handling should remain:

- If reading the send-confirmation setting fails, fail secure and show the setting as enabled.
- If writing the setting fails, keep the previous state and show the existing error alert.
- If disabling send biometrics, preserve the destructive confirmation alert.

## Testing

Add or update focused tests for the pilot:

- `SettingsScreen` renders the existing sections and no longer renders the send biometric switch.
- `SecurityPrivacyScreen` renders the send biometric setting, helper copy, switch, destructive off confirmation, off-state warning, transaction authorization options, and secret actions.
- `SendScreen` renders `Send biometrics are off` when send confirmation is disabled.

Add component tests only if the primitives contain meaningful branching. Avoid snapshot-only tests.

Manual verification:

- Inspect Settings and Security & Privacy on a narrow iPhone simulator size.
- Confirm text does not collide with switches, chevrons, or trailing values.
- Confirm rows feel tappable and visually aligned.
- Confirm warnings are visible without overwhelming the screen.
- Confirm existing send biometric behavior still works.

## Acceptance Criteria

- Shared layout tokens exist and are used by the pilot primitives.
- `SettingsScreen` and `SecurityPrivacyScreen` no longer duplicate their own full header/row/card spacing systems.
- The send biometric switch in Security & Privacy has stable copy/control alignment.
- Settings-like rows have consistent row heights, icon spacing, separators, trailing accessories, and pressed state.
- The Send warning uses consistent warning styling or remains locally styled only if extraction would require broad SendScreen refactoring.
- No behavior regressions in Settings, Security & Privacy, or Send.
- TypeScript, focused Jest tests, full Jest, `git diff --check`, and changed-scope React Doctor are run before implementation is claimed complete.
