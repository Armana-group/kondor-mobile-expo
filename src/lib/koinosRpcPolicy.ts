const SAFE_READ_ONLY_RPC_METHODS = new Set([
  'chain.get_account_nonce',
  'chain.get_account_rc',
  'chain.get_block',
  'chain.get_blocks',
  'chain.get_blocks_by_id',
  'chain.get_chain_id',
  'chain.get_fork_heads',
  'chain.get_head_info',
  'chain.get_resource_limits',
  'chain.get_transactions_by_id',
  'chain.read_contract',
]);

export const WEBVIEW_GENERIC_RPC_UNSUPPORTED_ERROR =
  'Generic RPC passthrough only supports safe read-only methods. Transaction or block submission requires manual approval.';
export const WEBVIEW_SUBMIT_BLOCK_UNSUPPORTED_ERROR =
  'Block submission is not available in the in-app provider. Transaction and block broadcasting require manual approval.';
export const WALLETCONNECT_JSONRPC_UNSUPPORTED_ERROR =
  'WalletConnect generic RPC passthrough is unsupported. Use supported read methods or an approved signing flow.';

export function isSafeReadOnlyRpcMethod(method: string): boolean {
  return SAFE_READ_ONLY_RPC_METHODS.has(method.trim().toLowerCase());
}

export function assertSafeReadOnlyRpcMethod(method: string): void {
  if (!method || !isSafeReadOnlyRpcMethod(method)) {
    throw new Error(WEBVIEW_GENERIC_RPC_UNSUPPORTED_ERROR);
  }
}
