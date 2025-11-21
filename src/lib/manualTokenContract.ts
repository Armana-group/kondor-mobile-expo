/**
 * Manual token contract implementation that bypasses protobuf extension issues
 * Uses protobufjs directly without the problematic extensions
 */

import { Provider, utils } from 'koilib';
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
}