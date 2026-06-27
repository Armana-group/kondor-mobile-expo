const MAINNET_EXPLORER = {
  base: 'https://www.koinscan.com',
  tx: 'https://www.koinscan.com/tx',
  address: 'https://www.koinscan.com/address',
  contract: 'https://www.koinscan.com/contracts',
  block: 'https://www.koinscan.com/block',
};

const TESTNET_EXPLORER = {
  base: 'https://harbinger.koinscan.com',
  tx: 'https://harbinger.koinscan.com/tx',
  address: 'https://harbinger.koinscan.com/address',
  contract: 'https://harbinger.koinscan.com/contracts',
  block: 'https://harbinger.koinscan.com/block',
};

// REST endpoints for transaction history.
// The account-history list endpoint omits block time, so per-transaction
// timestamps are fetched separately from a node that serves /v1/transaction/{id}
// (which includes `transaction.timestamp`). rest.koinos.io currently errors on
// that route, so we use the foundation seed node for it.
export const KOINOS_REST = {
  history: 'https://rest.koinos.io', // GET /v1/account/{address}/history
  transaction: 'https://seed.koinosfoundation.org', // GET /v1/transaction/{id} (has timestamp)
};

// Testnet metadata mirrors the current Koinos Foundation public endpoint.
export const HARBINGER_REST = {
  history: 'https://testnet.koinosfoundation.org',
  transaction: 'https://testnet.koinosfoundation.org',
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

// Network configurations for Koinos blockchain
export const MAINNET = {
  chainId: 'EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==',
  name: 'Mainnet',
  rpcNodes: [
    'https://api.koinos.io',
    'https://api.koinosblocks.com'
  ],
  koinContract: '19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK',
  nicknamesContractId: '1KD9Es7LBBjA1FY3ViCgQJ7e6WH1ipKbhz',
  kapNameServiceContractId: '13tmzDmfqCsbYT26C4CmKxq86d33senqH3',
  explorer: MAINNET_EXPLORER,
  rest: KOINOS_REST,
  freeManaSharer: FREE_MANA_SHARER.mainnet,
  isTestnet: false,
};

export const TESTNET = {
  chainId: 'EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ==',
  name: 'Harbinger (testnet)',
  rpcNodes: [
    'https://testnet.koinosfoundation.org/jsonrpc'
  ],
  koinContract: '1FaSvLjQJsCJKq5ybmGsMMQs8RQYyVv8ju',
  explorer: TESTNET_EXPLORER,
  rest: HARBINGER_REST,
  freeManaSharer: FREE_MANA_SHARER.testnet,
  isTestnet: true,
};

// Default to mainnet for production
export const DEFAULT_NETWORK = MAINNET;

export const KOINOS_TOKEN_CONTRACTS = {
  KOIN: MAINNET.koinContract,
  VHP: '12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq',
} as const;

export const KOINDX = {
  PERIPHERY_CONTRACT: '17e1q6Fh5RgnuA8K7v4KvXXH4k9qHgsT5s',
  FREE_MANA_SHARER: FREE_MANA_SHARER.mainnet,
  SWAP_FEE: 0.0025,
  QUOTE_CACHE_MS: 30 * 1000,
  PAIR_CACHE_MS: 5 * 60 * 1000,
  QUOTE_EXPIRY_MS: 60 * 1000,
  ENTRY_POINTS: {
    GET_PAIR: 0xefdc45c1,
    GET_AMOUNT_OUT: 0x2184ef25,
    GET_RESERVES: 0x6d0c5abf,
    SWAP_TOKENS_IN: 0x8b35a506,
    TOKEN_APPROVE: 0x74e21680,
  },
} as const;

// Block explorer URLs
export const EXPLORER = {
  mainnet: MAINNET_EXPLORER,
  testnet: TESTNET_EXPLORER,
};

// Storage keys
export const STORAGE_KEYS = {
  WALLET_ADDRESS: 'wallet_address',
  WALLET_BALANCE: 'wallet_balance',
  CURRENT_NETWORK: 'current_network',
};
