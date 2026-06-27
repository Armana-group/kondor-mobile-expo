# Mobile Network Health Design

## Goal

Make the Network settings screen show whether Mainnet and Harbinger are actually reachable before the user switches networks.

## Problem

The mobile app currently stores the selected network mode and labels any non-current network as available. That makes a failed Harbinger endpoint look safe to choose and can leave the app saying it is on testnet even when the selected testnet is unreachable.

## Design

Add a small network health service that checks each configured RPC node with `chain.get_head_info`. A node is online when it returns JSON-RPC head information, slow when it responds after the slow threshold, and unavailable when it times out, returns HTML/non-JSON, returns a JSON-RPC error, or omits the head height.

The Network settings screen will load health for Mainnet and Harbinger, show a plain status for each network, show when the health was last checked, and provide a refresh action. The current network summary will distinguish selection from reachability: selected network and network status are separate concepts.

Normal switching is blocked when the target network is unavailable. The user sees a direct alert explaining that Kondor cannot reach that network right now. No advanced switch-anyway control is included in this pass; dev-only override can be added later if needed.

## Copy Rules

- Use `Unavailable`, not `Available`, when no configured nodes respond.
- Use `Selected` for the chosen network, not `Current`, when health is unavailable.
- Explain the condition in user terms: "Kondor cannot reach Harbinger right now."
- Keep endpoint details out of the default UI; users can refresh without reading RPC URLs.

## Tests

- Service tests cover online, slow, non-JSON, JSON-RPC error, timeout, and summary behavior.
- Screen tests cover displaying health statuses, refresh action, blocking unavailable Harbinger switching, and still allowing an online target network switch after confirmation.
