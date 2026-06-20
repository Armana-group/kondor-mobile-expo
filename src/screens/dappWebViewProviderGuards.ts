const WEBVIEW_SEND_TRANSACTION_UNSUPPORTED_ERROR =
  'In-app provider transaction broadcasting requires manual approval. Use signer:sendTransaction instead.';

type SendTransactionProvider = {
  sendTransaction: (transaction: any, broadcast?: boolean) => Promise<unknown>;
};

export async function handleWebViewProviderSendTransaction(
  provider: SendTransactionProvider,
  args: Record<string, unknown>
): Promise<unknown> {
  if (args.broadcast !== false) {
    throw new Error(WEBVIEW_SEND_TRANSACTION_UNSUPPORTED_ERROR);
  }

  return provider.sendTransaction(args.transaction as any, false);
}

export { WEBVIEW_SEND_TRANSACTION_UNSUPPORTED_ERROR };
