// Debug RPC call to understand the error
const { Provider, utils } = require('koilib');

async function debugRPC() {
  console.log('Debugging RPC call...\n');

  try {
    const provider = new Provider(['https://api.koinos.io']);

    // Test different approaches
    const contractId = '15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL';
    const testAddress = '1HAngfguqii6WFjUp4JfbFjuDuqimaQ7JN';

    console.log('1. Testing with hex string entry point...');
    try {
      const result1 = await provider.call('chain.read_contract', {
        contract_id: contractId,
        entry_point: '0x5c721497', // As hex string
        args: ''
      });
      console.log('✓ Hex string worked:', result1);
    } catch (e) {
      console.log('✗ Hex string failed:', e.message);
    }

    console.log('\n2. Testing with decimal entry point...');
    try {
      const result2 = await provider.call('chain.read_contract', {
        contract_id: contractId,
        entry_point: 1550980247, // As decimal number
        args: ''
      });
      console.log('✓ Decimal worked:', result2);
    } catch (e) {
      console.log('✗ Decimal failed:', e.message);
    }

    console.log('\n3. Testing get_account_nonce (system call)...');
    try {
      const nonce = await provider.call('chain.get_account_nonce', {
        account: testAddress
      });
      console.log('✓ Account nonce:', nonce);
    } catch (e) {
      console.log('✗ Get nonce failed:', e.message);
    }

    console.log('\n4. Testing get_account_rc (system call)...');
    try {
      const rc = await provider.call('chain.get_account_rc', {
        account: testAddress
      });
      console.log('✓ Account RC:', rc);
    } catch (e) {
      console.log('✗ Get RC failed:', e.message);
    }

    console.log("\n5. Testing if it's a decode problem (empty args)...");
    try {
      // Try with explicitly empty args
      const result3 = await provider.call('chain.read_contract', {
        contract_id: contractId,
        entry_point: 0x5c721497
      });
      console.log('✓ No args worked:', result3);
    } catch (e) {
      console.log('✗ No args failed:', e.message);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

debugRPC();