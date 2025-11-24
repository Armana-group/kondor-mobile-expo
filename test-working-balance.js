// Test balance fetching with the correct KOIN contract address
const { Provider, utils } = require('koilib');
const protobuf = require('protobufjs/minimal');

// Configure protobufjs for Node.js
protobuf.util.Long = null;
protobuf.configure();

async function testWorkingBalance() {
  console.log('Testing balance fetching with CORRECT KOIN contract address...\n');

  try {
    const provider = new Provider(['https://api.koinos.io']);
    const contractId = '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK'; // CORRECT KOIN contract on mainnet
    // Using the KOIN contract address itself as test - it usually has balance
    const testAddress = '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK';

    console.log('Using CORRECT contract:', contractId);
    console.log('(Old system space contract was: 15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL)\n');

    console.log('1. Encoding balance_of arguments...');
    const addressBytes = utils.decodeBase58(testAddress);

    // Manual protobuf encoding for balance_of_arguments
    const writer = protobuf.Writer.create();
    writer.uint32(0x0A); // field 1, wire type 2 (length-delimited)
    writer.bytes(addressBytes);
    const encodedArgs = writer.finish();

    console.log('  - Encoded args (base64url):', utils.encodeBase64url(encodedArgs));

    console.log('\n2. Calling readContract with correct contract address...');
    const result = await provider.readContract({
      contract_id: contractId,
      entry_point: 0x5c721497, // balanceOf entry point
      args: utils.encodeBase64url(encodedArgs)
    });

    console.log('✅ SUCCESS! Got result:', result);

    if (result && result.result) {
      // Decode the result
      const resultBytes = utils.decodeBase64url(result.result);
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
      console.log('\n✅ BALANCE FETCHED SUCCESSFULLY:', balance, 'KOIN');
      console.log('\n🎉 The issue was using the wrong (system space) contract address!');
    } else {
      console.log('\nNo balance found (0 KOIN)');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('system space')) {
      console.log('\nThis error means we\'re still using the wrong contract address.');
    }
  }
}

testWorkingBalance();