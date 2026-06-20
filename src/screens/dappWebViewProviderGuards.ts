import {
  assertSafeReadOnlyRpcMethod,
  WEBVIEW_SUBMIT_BLOCK_UNSUPPORTED_ERROR,
} from '../lib/koinosRpcPolicy';

const WEBVIEW_SEND_TRANSACTION_UNSUPPORTED_ERROR =
  'In-app provider transaction broadcasting requires manual approval. Use signer:sendTransaction instead.';

type CallProvider = {
  call: (method: string, params: unknown) => Promise<unknown>;
};

type SendTransactionProvider = {
  sendTransaction: (transaction: any, broadcast?: boolean) => Promise<unknown>;
};

type SubmitBlockProvider = {
  submitBlock: (block: any) => Promise<unknown>;
};

export async function handleWebViewProviderCall(
  provider: CallProvider,
  args: Record<string, unknown>
): Promise<unknown> {
  const method = String(args.method || '');
  assertSafeReadOnlyRpcMethod(method);
  return provider.call(method, args.params);
}

export async function handleWebViewProviderSendTransaction(
  provider: SendTransactionProvider,
  args: Record<string, unknown>
): Promise<unknown> {
  if (args.broadcast !== false) {
    throw new Error(WEBVIEW_SEND_TRANSACTION_UNSUPPORTED_ERROR);
  }

  return provider.sendTransaction(args.transaction as any, false);
}

export async function handleWebViewProviderSubmitBlock(
  _provider: SubmitBlockProvider,
  _args: Record<string, unknown>
): Promise<never> {
  throw new Error(WEBVIEW_SUBMIT_BLOCK_UNSUPPORTED_ERROR);
}

export {
  WEBVIEW_SEND_TRANSACTION_UNSUPPORTED_ERROR,
  WEBVIEW_SUBMIT_BLOCK_UNSUPPORTED_ERROR,
};
