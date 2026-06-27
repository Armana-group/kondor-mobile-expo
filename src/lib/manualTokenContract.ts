/**
 * Manual token contract implementation that bypasses protobuf extension issues
 * Uses protobufjs directly without the problematic extensions
 */

import { Provider, Signer, utils, Transaction } from 'koilib';
import * as protobuf from 'protobufjs/minimal';
import { createLogger } from './logger';
import { dryRunRcLimit } from './manaEstimation';

const log = createLogger('TokenContract');

export interface TransferBroadcastAcceptedDetails {
  transactionId: string;
  timestamp: number;
}

export interface TransferOptions {
  rcLimit?: number;
  decimals?: number;
  maxRc?: number;
  memo?: string;
  onBroadcastAccepted?: (details: TransferBroadcastAcceptedDetails) => void;
}

// Configure protobufjs for the environment
if (typeof window !== 'undefined' && window.Buffer) {
  // protobufjs: assigning Long = null disables 64-bit Long support
  protobuf.util.Long = null as unknown as typeof protobuf.util.Long;
  protobuf.configure();
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
   * Uses dry-run estimation to determine actual RC needed (Kondor pattern)
   */
  async transfer(
    signer: Signer,
    to: string,
    amount: string,
    options: TransferOptions = {}
  ): Promise<{ transactionId: string }> {
    try {
      const decimals = options.decimals ?? 8;
      log.debug(' Starting transfer to:', to, 'amount:', amount, 'decimals:', decimals);

      const from = signer.getAddress();

      // Convert amount to smallest unit using the token's decimals
      const value = utils.parseUnits(amount, decimals);
      log.debug(' Parsed amount:', value);

      // Encode transfer arguments
      const encodedArgs = this.encodeTransferArgs(from, to, value, options.memo);
      log.debug(' Encoded transfer args');

      let rcLimit = options.rcLimit;

      // If no RC limit provided, estimate it via dry-run (Kondor pattern)
      if (!rcLimit) {
        log.debug(' No RC limit provided, estimating via dry-run...');

        // Choose an rc_limit for the dry-run. Prefer the account's MAX rc
        // (balance, passed as options.maxRc) over currently-available rc, which
        // can read low/stale right after funding and wrongly cap the dry-run —
        // the node then rejects with "insufficient rc" until a retry. See
        // dryRunRcLimit / the kondor estimateAndAdjustMana pattern.
        let availableRc = 0;
        try {
          const rcResult = await this.provider.call<{ rc?: string }>('chain.get_account_rc', {
            account: from
          });
          availableRc = Number(rcResult.rc || 0);
        } catch (error) {
          log.debug(' Could not fetch available RC');
        }
        const estimationLimit = dryRunRcLimit({ maxRc: options.maxRc, availableRc });
        log.debug(' Dry-run rc_limit:', estimationLimit, '(maxRc:', options.maxRc, 'availableRc:', availableRc, ')');

        // Create a test transaction for estimation
        const estimateTx = new Transaction({
          signer,
          provider: this.provider,
          options: {
            rcLimit: estimationLimit,
          }
        });

        // Add the transfer operation
        await estimateTx.pushOperation({
          call_contract: {
            contract_id: this.contractId,
            entry_point: 0x27f576ca, // transfer entry point
            args: utils.encodeBase64url(encodedArgs)
          }
        });

        // Dry-run: send with broadcast: false to get actual RC usage
        log.debug(' Performing dry-run...');
        const dryRunReceipt = await estimateTx.send({ broadcast: false });
        log.debug(' Dry-run receipt:', dryRunReceipt);

        // Add 10% buffer to estimated RC (Kondor pattern)
        const rcUsed = Number(dryRunReceipt.rc_used || 0);
        rcLimit = Math.floor(1.1 * rcUsed);
        log.debug(' Estimated RC used:', rcUsed);
        log.debug(' RC limit with 10% buffer:', rcLimit);
      }

      // Create the actual transaction with estimated RC limit
      const tx = new Transaction({
        signer,
        provider: this.provider,
        options: {
          rcLimit: rcLimit || 100000000, // Fallback to 100M if estimation fails
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

      // Send transaction (broadcast: true)
      log.debug(' Sending transaction...');
      const receipt = await tx.send();
      log.debug(' Transaction sent, receipt:', receipt);
      options.onBroadcastAccepted?.({
        transactionId: receipt.id,
        timestamp: Date.now(),
      });

      // Wait for confirmation
      log.debug(' Waiting for confirmation...');
      await tx.wait();
      log.debug(' Transaction confirmed!');

      return { transactionId: receipt.id };
    } catch (error) {
      log.error(' Transfer error:', error);
      throw error;
    }
  }
}
