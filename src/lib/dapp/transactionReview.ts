import { Transaction, type Provider, type TransactionJson } from 'koilib';

import { validateRcLimit } from '../mana';
export { validateRcLimit } from '../mana';

export function copyTransaction(transaction: TransactionJson): TransactionJson {
  return JSON.parse(JSON.stringify(transaction)) as TransactionJson;
}

export function transactionPayload(transaction: TransactionJson): string {
  return JSON.stringify([transaction.id, transaction.header, transaction.operations]);
}

export async function prepareTransactionReview(params: {
  transaction: TransactionJson;
  provider: Provider;
  signerAddress: string;
  chainId: string;
  defaultPayer: string;
  rcLimit: string;
}): Promise<TransactionJson> {
  const { provider, signerAddress, chainId, defaultPayer } = params;
  const transaction = copyTransaction(params.transaction);
  const header = transaction.header ?? {};
  if (header.chain_id && header.chain_id !== chainId) {
    throw new Error('Transaction network does not match the active wallet network.');
  }

  if (header.rc_limit !== undefined &&
      typeof header.rc_limit !== 'string' &&
      !Number.isSafeInteger(header.rc_limit)) {
    throw new Error('Use a decimal string for an exact mana limit.');
  }

  const hasSignatures = Boolean(transaction.signatures?.length);
  const fixed = hasSignatures || Boolean(header.nonce && header.payer && header.chain_id && header.rc_limit !== undefined);
  if (fixed) {
    if (!header.nonce || !header.payer || !header.chain_id || header.rc_limit === undefined) {
      throw new Error('The signed transaction is missing required header fields.');
    }
    validateRcLimit(String(header.rc_limit));
    const canonical = await Transaction.prepareTransaction(copyTransaction(transaction));
    if ((transaction.id && transaction.id !== canonical.id) ||
        (header.operation_merkle_root && header.operation_merkle_root !== canonical.header?.operation_merkle_root)) {
      throw new Error('The transaction ID does not match the header and operations.');
    }
    if (hasSignatures && (!transaction.id || !header.operation_merkle_root)) {
      throw new Error('The signed transaction is missing its ID or operation root.');
    }
    return hasSignatures ? transaction : canonical;
  }

  const payer = header.payer || defaultPayer;
  return Transaction.prepareTransaction({
    ...transaction,
    header: {
      ...header,
      payer,
      ...(payer !== signerAddress ? { payee: header.payee ?? signerAddress } : {}),
      chain_id: chainId,
      rc_limit: validateRcLimit(String(header.rc_limit ?? params.rcLimit)),
    },
  }, provider);
}
