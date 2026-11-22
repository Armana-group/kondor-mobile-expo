import { settleJournalTransactions } from './transactionJournal';
/**
 * Manual token contract implementation that bypasses protobuf extension issues
 * Uses protobufjs directly without the problematic extensions
 */

import { Provider, Signer, utils, Transaction } from 'koilib';
import * as protobuf from 'protobufjs/minimal';
import { createLogger } from './logger';
import { parseDecimalAmount } from './swapMath';
import { validateRcLimit, readPayerCapacity, assertManaCapacity } from './mana';
import { submitTransactionOnce, TransactionOutcomeUnknownError } from './transactionBroadcast';
import { useTransactionStore } from '../stores/transactionStore';
import { useTokenStore } from '../stores/tokenStore';
import { getActiveNetworkConfig, getNetworkConfigForMode, type NetworkMode } from '../stores/networkStore';

const log = createLogger('TokenContract');

export interface TransferBroadcastAcceptedDetails {
  transactionId: string;
  timestamp: number;
}

export interface TransferOptions {
  rcLimit: string;
  payer?: string;
  networkMode?: NetworkMode;
  assertCurrent?: () => void;
  decimals?: number;
  memo?: string;
  onBroadcastAccepted?: (details: TransferBroadcastAcceptedDetails) => void;
}

export class ManualTokenContract {
  private provider: Provider;
  private contractId: string;

  constructor(contractId: string, provider: Provider) {
    this.contractId = contractId;
    this.provider = provider;
  }

  /**
   * Manually encode balance_of arguments using protobufjs
   */
  private encodeBalanceOfArgs(address: string): Uint8Array {
    try {
      // Decode the base58 address to bytes
      const addressBytes = utils.decodeBase58(address);

      // Manual protobuf encoding for balance_of_arguments
      // Field 1 (owner) as bytes: tag = (1 << 3) | 2 = 0x0A
      const writer = protobuf.Writer.create();
      writer.uint32(0x0A); // field 1, wire type 2 (length-delimited)
      writer.bytes(addressBytes);

      return writer.finish();
    } catch (error) {
      log.error(' Error encoding args:', error);
      throw error;
    }
  }

  /**
   * Manually decode balance_of result using protobufjs
   */
  private decodeBalanceOfResult(data: Uint8Array): string {
    try {
      const reader = protobuf.Reader.create(data);
      let value = '0';

      while (reader.pos < reader.len) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: // Field 1: value (uint64)
            // Read as uint64 and convert to string
            const longValue = reader.uint64();
            value = longValue.toString();
            break;
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return value;
    } catch (error) {
      log.error(' Error decoding result:', error);
      return '0';
    }
  }

  /**
   * Manually encode transfer arguments using protobufjs
   */
  private encodeTransferArgs(from: string, to: string, value: string, memo?: string): Uint8Array {
    try {
      // Decode addresses to bytes
      const fromBytes = utils.decodeBase58(from);
      const toBytes = utils.decodeBase58(to);

      // Manual protobuf encoding for transfer_arguments
      // Field 1 (from) as bytes
      // Field 2 (to) as bytes
      // Field 3 (value) as uint64
      const writer = protobuf.Writer.create();

      writer.uint32(0x0A); // field 1, wire type 2 (length-delimited)
      writer.bytes(fromBytes);

      writer.uint32(0x12); // field 2, wire type 2 (length-delimited)
      writer.bytes(toBytes);

      writer.uint32(0x18); // field 3, wire type 0 (varint)
      writer.uint64(value);

      const trimmedMemo = memo?.trim();
      if (trimmedMemo) {
        writer.uint32(0x22); // field 4, wire type 2 (length-delimited)
        writer.string(trimmedMemo);
      }

      return writer.finish();
    } catch (error) {
      log.error(' Error encoding transfer args:', error);
      throw error;
    }
  }

  async getBalance(address: string, decimals: number = 8): Promise<string> {
    try {
      log.debug(' Getting balance for:', address);

      // Encode the arguments
      const encodedArgs = this.encodeBalanceOfArgs(address);
      log.debug(' Encoded args length:', encodedArgs.length);

      // Make the RPC call
      const result = await this.provider.call<{ result?: string }>('chain.read_contract', {
        contract_id: this.contractId,
        entry_point: 0x5c721497, // balanceOf entry point
        args: utils.encodeBase64url(encodedArgs)
      });

      log.debug(' Got RPC result');

      if (!result || !result.result) {
        log.debug(' No result returned, balance is 0');
        return '0';
      }

      // Decode the result
      const resultBytes = utils.decodeBase64url(result.result);
      const value = this.decodeBalanceOfResult(resultBytes);

      // Format the balance with the token's decimals
      const balance = utils.formatUnits(value, decimals);
      log.debug(' Formatted balance:', balance);

      return balance;
    } catch (error) {
      log.error(' Error getting balance:', error);
      throw error;
    }
  }

  /**
   * Transfer tokens using manual transaction creation to avoid protobuf issues
   * Signs the reviewed payer and mana ceiling once, then submits once.
   */
  async transfer(
    signer: Signer,
    to: string,
    amount: string,
    options: TransferOptions
  ): Promise<{ transactionId: string }> {
    try {
      const decimals = options.decimals ?? 8;
      const networkMode = options.networkMode ?? (getActiveNetworkConfig().isTestnet ? 'harbinger' : 'mainnet');
      log.debug(' Starting transfer to:', to, 'amount:', amount, 'decimals:', decimals);

      const from = signer.getAddress();

      // Convert amount to smallest unit using the token's decimals
      const value = parseDecimalAmount(amount, decimals);
      log.debug(' Parsed amount:', value);

      // Encode transfer arguments
      const encodedArgs = this.encodeTransferArgs(from, to, value, options.memo);
      log.debug(' Encoded transfer args');

      const rcLimit = validateRcLimit(options.rcLimit);
      const network = getNetworkConfigForMode(networkMode);
      const payer = options.payer || from;
      const assertResources = async () => {
        options.assertCurrent?.();
        const capacity = await readPayerCapacity({
          provider: this.provider, payer, koinContract: network.koinContract,
          sponsor: network.freeManaSharer,
          outgoingKoin: payer === from && this.contractId === network.koinContract ? value : '0',
        });
        options.assertCurrent?.();
        assertManaCapacity(rcLimit, capacity);
      };
      await assertResources();

      // Create the transaction with the reviewed exact RC limit
      const tx = new Transaction({
        signer,
        provider: this.provider,
        options: {
          rcLimit,
          payer,
          chainId: network.chainId,
          ...(payer !== from ? { payee: from } : {}),
        }
      });

      log.debug(' Preparing transaction with RC limit:', tx.transaction.header?.rc_limit);

      // Add the transfer operation
      await tx.pushOperation({
        call_contract: {
          contract_id: this.contractId,
          entry_point: 0x27f576ca, // transfer entry point
          args: utils.encodeBase64url(encodedArgs)
        }
      });

      log.debug(' Transaction prepared, ID:', tx.transaction.id);

      await tx.prepare();
      await assertResources();
      await signer.signTransaction(tx.transaction);
      options.assertCurrent?.();
      const token = useTokenStore.getState().getTokenByContractId(this.contractId);
      const receipt = await submitTransactionOnce({
        provider: this.provider,
        transaction: tx.transaction,
        assertCurrent: options.assertCurrent,
        pending: {
          address: from,
          networkMode,
          source: 'send',
          transaction: {
            type: 'send', amount, token: this.contractId,
            tokenSymbol: token?.symbol ?? 'TOKEN', tokenDecimals: decimals, tokenIcon: token?.icon,
            from, to, timestamp: Date.now(), fee: '0', payer, memo: options.memo?.trim(),
          },
        },
        onPersisted: pending => useTransactionStore.getState().addPendingTransaction(pending),
        onRejected: pending => useTransactionStore.getState().removeRejectedSubmission(pending, pending.chainTransactionId!),
      });
      try {
        options.onBroadcastAccepted?.({ transactionId: receipt.id, timestamp: Date.now() });
        await this.provider.wait(receipt.id);
        await settleJournalTransactions({ address: from, networkMode }, [receipt.id]);
        useTransactionStore.getState().confirmPendingTransactionByChainId({ address: from, networkMode }, receipt.id);
      } catch {
        throw new TransactionOutcomeUnknownError(receipt.id);
      }
      return { transactionId: receipt.id };
    } catch (error) {
      log.error(' Transfer error:', error);
      throw error;
    }
  }
}
