// Network configurations for Koinos blockchain
export const MAINNET = {
  chainId: 'EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==',
  name: 'Mainnet',
  rpcNodes: [
    'https://api.koinos.io',
    'https://api.koinosblocks.com'
  ],
  koinContract: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK' // Updated KOIN contract (old: 15DJN4a8SgrbGhhGksSBASiSYjGnMU8dGL was in system space)
};

export const TESTNET = {
  chainId: 'EiBncD4pKRIQWco_WRqo5Q-xnXR7JuO3PtZv983mKdKHSQ==',
  name: 'Harbinger (testnet)',
  rpcNodes: [
    'https://harbinger-api.koinos.io',
    'https://testnet.koinosblocks.com'
  ],
  koinContract: '1FaSvLjQJsCJKq5ybmGsMMQs8RQYyVv8ju'
};

// Default to mainnet for production
export const DEFAULT_NETWORK = MAINNET;

// REST endpoints for transaction history.
// The account-history list endpoint omits block time, so per-transaction
// timestamps are fetched separately from a node that serves /v1/transaction/{id}
// (which includes `transaction.timestamp`). rest.koinos.io currently errors on
// that route, so we use the foundation seed node for it.
export const KOINOS_REST = {
  history: 'https://rest.koinos.io', // GET /v1/account/{address}/history
  transaction: 'https://seed.koinosfoundation.org', // GET /v1/transaction/{id} (has timestamp)
};

// BIP44 path for Koinos (SLIP44: 659)
export const KOINOS_PATH = "m/44'/659'/";

// Mana/RC defaults
export const DEFAULT_RC_LIMIT = 1000000000;

// Free Mana Sharer contracts (pay for user transactions)
export const FREE_MANA_SHARER = {
  mainnet: '162GhJwsciDiKsgwzj2t6VoFHt3RMzGKdG',
  testnet: '17mzHQmfp3qNWQpvJLvNgFXqoW4HoS7Xbj',
};

// Block explorer URLs
export const EXPLORER = {
  mainnet: {
    base: 'https://koinscan.com',
    tx: 'https://koinscan.com/tx',
    address: 'https://koinscan.com/address',
    token: 'https://koinscan.com/token',
    block: 'https://koinscan.com/block',
  },
  testnet: {
    base: 'https://harbinger.koinscan.com',
    tx: 'https://harbinger.koinscan.com/tx',
    address: 'https://harbinger.koinscan.com/address',
    token: 'https://harbinger.koinscan.com/token',
    block: 'https://harbinger.koinscan.com/block',
  },
};

// Storage keys
export const STORAGE_KEYS = {
  WALLET_ADDRESS: 'wallet_address',
  WALLET_BALANCE: 'wallet_balance',
  CURRENT_NETWORK: 'current_network',
};