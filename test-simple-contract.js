// Test our SimpleTokenContract implementation
const { Provider, utils } = require('koilib');

async function testSimpleContract() {
  console.log('Testing SimpleTokenContract approach without Serializer...\n');

  try {
    console.log('1. Creating Provider...');
    const provider = new Provider(['https://api.koinos.io']);
    console.log('✓ Provider created');

    console.log('\n2. Testing direct RPC call without protobuf...');
    const testAddress = '1HAngfguqii6WFjUp4JfbFjuDuqimaQ7JN';

    console.log('\n3. Encoding address for RPC call...');
    // Manually encode the address as bytes for the RPC call
    const addressBytes = utils.decodeBase58(testAddress);
    console.log('Address decoded to bytes (length):', addressBytes.length);

    // Manual protobuf encoding for balance_of_arguments
    // Field 1 (owner) as bytes: tag = (1 << 3) | 2 = 0x0A
    const tag = 0x0A; // field 1, wire type 2 (length-delimited)
    const encodedArgs = new Uint8Array(2 + addressBytes.length);
    encodedArgs[0] = tag;
    encodedArgs[1] = addressBytes.length;
    encodedArgs.set(addressBytes, 2);

    console.log('✓ Arguments manually encoded');

    console.log('\n4. Making RPC call to get balance...');
    const contractId = '15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL'; // KOIN on mainnet
    const result = await provider.call('chain.read_contract', {
      contract_id: contractId,
      entry_point: 1550980247, // balanceOf entry point
      args: utils.encodeBase64url(encodedArgs)
    });
    console.log('✓ RPC call successful');
    console.log('Result:', result);

    if (!result || !result.result) {
      console.log('\n5. No balance found (0 KOIN)');
    } else {
      console.log('\n5. Decoding result...');
      const resultBytes = utils.decodeBase64url(result.result);
      console.log('Result bytes length:', resultBytes.length);

      // Manual protobuf decoding for balance_of_result
      // Field 1 (value) as uint64
      let value = 0n;
      if (resultBytes.length > 2 && resultBytes[0] === 0x08) { // field 1, varint
        // Decode varint
        let shift = 0n;
        for (let i = 1; i < resultBytes.length && i < 10; i++) {
          const byte = resultBytes[i];
          value |= BigInt(byte & 0x7F) << shift;
          shift += 7n;
          if (!(byte & 0x80)) break;
        }
      }

      const balance = utils.formatUnits(value.toString(), 8);
      console.log(`✓ Balance: ${balance} KOIN`);
    }

    console.log('\n✅ Direct RPC approach works without protobuf issues!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testSimpleContract();