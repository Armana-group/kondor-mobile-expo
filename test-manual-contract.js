// Test our ManualTokenContract implementation
const { Provider, utils } = require('koilib');
const protobuf = require('protobufjs/minimal');

// Configure protobufjs for Node.js
protobuf.util.Long = null;
protobuf.configure();

class ManualTokenContract {
  constructor(contractId, provider) {
    this.contractId = contractId;
    this.provider = provider;
  }

  encodeBalanceOfArgs(address) {
    try {
      // Decode the base58 address to bytes
      const addressBytes = utils.decodeBase58(address);
      console.log('Address bytes length:', addressBytes.length);

      // Manual protobuf encoding for balance_of_arguments
      const writer = protobuf.Writer.create();
      writer.uint32(0x0A); // field 1, wire type 2 (length-delimited)
      writer.bytes(addressBytes);

      return writer.finish();
    } catch (error) {
      console.error('Error encoding args:', error);
      throw error;
    }
  }

  decodeBalanceOfResult(data) {
    try {
      const reader = protobuf.Reader.create(data);
      let value = '0';

      while (reader.pos < reader.len) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1: // Field 1: value (uint64)
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
      console.error('Error decoding result:', error);
      return '0';
    }
  }

  async getBalance(address) {
    try {
      console.log('Getting balance for:', address);

      // Encode the arguments
      const encodedArgs = this.encodeBalanceOfArgs(address);
      console.log('Encoded args length:', encodedArgs.length);
      console.log('Encoded args (base64url):', utils.encodeBase64url(encodedArgs));

      // Make the RPC call
      const result = await this.provider.call('chain.read_contract', {
        contract_id: this.contractId,
        entry_point: 0x5c721497, // balanceOf entry point
        args: utils.encodeBase64url(encodedArgs)
      });

      console.log('Got RPC result:', result);

      if (!result || !result.result) {
        console.log('No result returned, balance is 0');
        return '0';
      }

      // Decode the result
      const resultBytes = utils.decodeBase64url(result.result);
      console.log('Result bytes length:', resultBytes.length);
      const value = this.decodeBalanceOfResult(resultBytes);

      // Format the balance
      const balance = utils.formatUnits(value, 8);
      console.log('Formatted balance:', balance);

      return balance;
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }
}

async function testManualContract() {
  console.log('Testing ManualTokenContract implementation...\n');

  try {
    console.log('1. Creating Provider...');
    const provider = new Provider(['https://api.koinos.io']);
    console.log('✓ Provider created');

    console.log('\n2. Creating ManualTokenContract...');
    const contractId = '15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL'; // KOIN on mainnet
    const tokenContract = new ManualTokenContract(contractId, provider);
    console.log('✓ Contract created');

    console.log('\n3. Testing getBalance for a known address...');
    const testAddress = '1HAngfguqii6WFjUp4JfbFjuDuqimaQ7JN';
    const balance = await tokenContract.getBalance(testAddress);

    console.log('\n✅ Success! Balance:', balance, 'KOIN');
    console.log('ManualTokenContract implementation works without protobuf extension issues!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testManualContract();