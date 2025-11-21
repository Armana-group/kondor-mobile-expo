/**
 * Simple token contract implementation that avoids protobuf extension issues
 * This uses manual encoding/decoding to bypass the problematic tokenAbi
 */

import { Provider, utils, Serializer } from 'koilib';

// Simple types without protobuf extensions
const SIMPLE_TOKEN_TYPES = {
  nested: {
    balance_of_arguments: {
      fields: {
        owner: {
          type: "bytes",
          id: 1
        }
      }
    },
    balance_of_result: {
      fields: {
        value: {
          type: "uint64",
          id: 1
        }
      }
    }
  }
};

export class SimpleTokenContract {
  private provider: Provider;
  private contractId: string;
  private serializer: Serializer;

  constructor(contractId: string, provider: Provider) {
    this.contractId = contractId;
    this.provider = provider;

    // Create a simple serializer without the problematic extensions
    this.serializer = new Serializer(SIMPLE_TOKEN_TYPES);
  }

  async getBalance(address: string): Promise<string> {
    try {
      console.log('[SimpleTokenContract] Getting balance for:', address);

      // Serialize the arguments
      const args = await this.serializer.serialize({
        owner: utils.decodeBase58(address)
      }, 'balance_of_arguments');

      console.log('[SimpleTokenContract] Serialized args, making RPC call...');

      // Make the RPC call
      const result = await this.provider.call('chain.read_contract', {
        contract_id: this.contractId,
        entry_point: 1550980247, // balanceOf entry point
        args: utils.encodeBase64url(args)
      });

      console.log('[SimpleTokenContract] Got RPC result:', result);

      if (!result || !result.result) {
        console.log('[SimpleTokenContract] No result returned, balance is 0');
        return '0';
      }

      // Deserialize the result
      const decodedResult = await this.serializer.deserialize(
        utils.decodeBase64url(result.result),
        'balance_of_result'
      );

      console.log('[SimpleTokenContract] Decoded balance result:', decodedResult);

      // Format the balance
      const balance = utils.formatUnits(decodedResult.value || '0', 8);
      console.log('[SimpleTokenContract] Formatted balance:', balance);

      return balance;
    } catch (error) {
      console.error('[SimpleTokenContract] Error getting balance:', error);
      throw error;
    }
  }
}