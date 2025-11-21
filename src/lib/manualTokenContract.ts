/**
 * Manual token contract implementation that bypasses protobuf extension issues
 * Uses protobufjs directly without the problematic extensions
 */

import { Provider, Signer, utils, Transaction } from 'koilib';
import * as protobuf from 'protobufjs/minimal';

// Configure protobufjs for the environment
if (typeof window !== 'undefined' && window.Buffer) {
  protobuf.util.Long = null;
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
      console.error('[ManualTokenContract] Error encoding args:', error);
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
      console.error('[ManualTokenContract] Error decoding result:', error);
      return '0';
    }
  }

  /**
   * Manually encode transfer arguments using protobufjs
   */
  private encodeTransferArgs(from: string, to: string, value: string): Uint8Array {
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

      return writer.finish();
    } catch (error) {
      console.error('[ManualTokenContract] Error encoding transfer args:', error);
      throw error;
    }
  }

  async getBalance(address: string): Promise<string> {
    try {
      console.log('[ManualTokenContract] Getting balance for:', address);

      // Encode the arguments
      const encodedArgs = this.encodeBalanceOfArgs(address);
      console.log('[ManualTokenContract] Encoded args length:', encodedArgs.length);

      // Make the RPC call
      const result = await this.provider.call('chain.read_contract', {
        contract_id: this.contractId,
        entry_point: 0x5c721497, // balanceOf entry point
        args: utils.encodeBase64url(encodedArgs)
      });

      console.log('[ManualTokenContract] Got RPC result');

      if (!result || !result.result) {
        console.log('[ManualTokenContract] No result returned, balance is 0');
        return '0';
      }

      // Decode the result
      const resultBytes = utils.decodeBase64url(result.result);
      const value = this.decodeBalanceOfResult(resultBytes);

      // Format the balance
      const balance = utils.formatUnits(value, 8);
      console.log('[ManualTokenContract] Formatted balance:', balance);

      return balance;
    } catch (error) {
      console.error('[ManualTokenContract] Error getting balance:', error);
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
    options: { rcLimit?: number } = {}
  ): Promise<{ transactionId: string }> {
    try {
      console.log('[ManualTokenContract] Starting transfer to:', to, 'amount:', amount);

      const from = signer.getAddress();

      // Convert amount to smallest unit (8 decimals)
      const value = utils.parseUnits(amount, 8);
      console.log('[ManualTokenContract] Parsed amount:', value);

      // Encode transfer arguments
      const encodedArgs = this.encodeTransferArgs(from, to, value);
      console.log('[ManualTokenContract] Encoded transfer args');

      let rcLimit = options.rcLimit;

      // If no RC limit provided, estimate it via dry-run (Kondor pattern)
      if (!rcLimit) {
        console.log('[ManualTokenContract] No RC limit provided, estimating via dry-run...');

        // Create a test transaction for estimation
        const estimateTx = new Transaction({
          signer,
          provider: this.provider,
          options: {
            rcLimit: 1000000000, // High limit for estimation
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
        console.log('[ManualTokenContract] Performing dry-run...');
        const dryRunReceipt = await estimateTx.send({ broadcast: false });
        console.log('[ManualTokenContract] Dry-run receipt:', dryRunReceipt);

        // Add 10% buffer to estimated RC (Kondor pattern)
        const rcUsed = Number(dryRunReceipt.rc_used || 0);
        rcLimit = Math.floor(1.1 * rcUsed);
        console.log('[ManualTokenContract] Estimated RC used:', rcUsed);
        console.log('[ManualTokenContract] RC limit with 10% buffer:', rcLimit);
      }

      // Create the actual transaction with estimated RC limit
      const tx = new Transaction({
        signer,
        provider: this.provider,
        options: {
          rcLimit: rcLimit || 100000000, // Fallback to 100M if estimation fails
        }
      });

      console.log('[ManualTokenContract] Preparing transaction with RC limit:', tx.header?.rc_limit);

      // Add the transfer operation
      await tx.pushOperation({
        call_contract: {
          contract_id: this.contractId,
          entry_point: 0x27f576ca, // transfer entry point
          args: utils.encodeBase64url(encodedArgs)
        }
      });

      console.log('[ManualTokenContract] Transaction prepared, ID:', tx.id);

      // Send transaction (broadcast: true)
      console.log('[ManualTokenContract] Sending transaction...');
      const receipt = await tx.send();
      console.log('[ManualTokenContract] Transaction sent, receipt:', receipt);

      // Wait for confirmation
      console.log('[ManualTokenContract] Waiting for confirmation...');
      await tx.wait();
      console.log('[ManualTokenContract] Transaction confirmed!');

      return { transactionId: receipt.id };
    } catch (error) {
      console.error('[ManualTokenContract] Transfer error:', error);
      throw error;
    }
  }
}