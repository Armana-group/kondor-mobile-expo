// Curated list of Koinos dApps

export interface DApp {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  category: 'defi' | 'tools' | 'nft' | 'social' | 'gaming' | 'other';
  featured?: boolean;
  requiresWalletConnect?: boolean; // Shows WalletConnect info before opening
}

export const CURATED_DAPPS: DApp[] = [
  {
    id: 'koindx',
    name: 'KoinDX',
    description: 'Decentralized exchange for trading Koinos tokens',
    url: 'https://app.koindx.com',
    icon: 'https://koindx.com/favicon.ico',
    category: 'defi',
    featured: true,
    requiresWalletConnect: true,
  },
  {
    id: 'kollection',
    name: 'Kollection',
    description: 'NFT marketplace for the Koinos ecosystem',
    url: 'https://kollection.app',
    icon: 'https://kollection.app/favicon.ico',
    category: 'nft',
    featured: true,
  },
  {
    id: 'koinscan',
    name: 'KoinScan',
    description: 'Block explorer and analytics for Koinos',
    url: 'https://koinscan.io',
    icon: 'https://koinscan.io/favicon.ico',
    category: 'tools',
    featured: true,
  },
];

// Category labels and icons
export const DAPP_CATEGORIES = {
  defi: { label: 'DeFi', icon: 'trending-up' },
  tools: { label: 'Tools', icon: 'construct' },
  nft: { label: 'NFT', icon: 'images' },
  social: { label: 'Social', icon: 'people' },
  gaming: { label: 'Gaming', icon: 'game-controller' },
} as const;

// Get featured dApps
export const getFeaturedDApps = () => CURATED_DAPPS.filter(app => app.featured);

// Get dApps by category
export const getDAppsByCategory = (category: DApp['category']) =>
  CURATED_DAPPS.filter(app => app.category === category);
