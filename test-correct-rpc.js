// Test correct RPC structure for balance fetching
const { Provider, utils } = require('koilib');
const protobuf = require('protobufjs/minimal');

// Configure protobufjs for Node.js
protobuf.util.Long = null;
protobuf.configure();

async function testCorrectRPC() {
  console.log('Testing correct RPC structure...\n');

  try {
    const provider = new Provider(['https://api.koinos.io']);
    const contractId = '15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL'; // KOIN on mainnet
    const testAddress = '1HAngfguqii6WFjUp4JfbFjuDuqimaQ7JN';

    console.log('1. Encoding balance_of arguments...');
    const addressBytes = utils.decodeBase58(testAddress);

    // Manual protobuf encoding for balance_of_arguments
    const writer = protobuf.Writer.create();
    writer.uint32(0x0A); // field 1, wire type 2 (length-delimited)
    writer.bytes(addressBytes);
    const encodedArgs = writer.finish();

    console.log('  - Encoded args length:', encodedArgs.length);
    console.log('  - Encoded args (base64url):', utils.encodeBase64url(encodedArgs));

    console.log('\n2. Testing with koilib Provider.readContract method...');
    try {
      // Use the readContract method like Contract.js does
      const result1 = await provider.readContract({
        contract_id: contractId,
        entry_point: 0x5c721497, // balanceOf entry point as number
        args: utils.encodeBase64url(encodedArgs)
      });
      console.log('✓ readContract worked:', result1);

      if (result1 && result1.result) {
        // Decode the result
        const resultBytes = utils.decodeBase64url(result1.result);
        console.log('  - Result bytes length:', resultBytes.length);

        // Decode protobuf result
        const reader = protobuf.Reader.create(resultBytes);
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

        const balance = utils.formatUnits(value, 8);
        console.log('  - Decoded balance:', balance, 'KOIN');
      }
    } catch (e) {
      console.log('✗ readContract failed:', e.message);
    }

    console.log('\n3. Testing with direct chain.read_contract RPC call...');
    try {
      // Try direct RPC call with same structure
      const result2 = await provider.call('chain.read_contract', {
        contract_id: contractId,
        entry_point: 0x5c721497,
        args: utils.encodeBase64url(encodedArgs)
      });
      console.log('✓ Direct RPC worked:', result2);
    } catch (e) {
      console.log('✗ Direct RPC failed:', e.message);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testCorrectRPC();