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

// BIP44 path for Koinos (SLIP44: 659)
export const KOINOS_PATH = "m/44'/659'/";

// Mana/RC defaults
export const DEFAULT_RC_LIMIT = 1000000000;

// Free Mana Sharer contracts (pay for user transactions)
export const FREE_MANA_SHARER = {
  mainnet: '162GhJwsciDiKsgwzj2t6VoFHt3RMzGKdG',
  testnet: '17mzHQmfp3qNWQpvJLvNgFXqoW4HoS7Xbj',
};

// Storage keys
export const STORAGE_KEYS = {
  WALLET_ADDRESS: 'wallet_address',
  WALLET_BALANCE: 'wallet_balance',
  CURRENT_NETWORK: 'current_network',
};