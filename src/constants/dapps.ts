// Curated list of Koinos dApps

export interface DApp {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  category: 'defi' | 'tools' | 'nft' | 'social' | 'gaming';
  featured?: boolean;
}

export const CURATED_DAPPS: DApp[] = [
  {
    id: 'koindx',
    name: 'KoinDX',
    description: 'Decentralized exchange for trading Koinos tokens',
    url: 'https://koindx.com',
    icon: 'https://koindx.com/favicon.ico',
    category: 'defi',
    featured: true,
  },
  {
    id: 'fogata',
    name: 'Fogata',
    description: 'Mining pool for Koinos - stake KOIN to earn rewards',
    url: 'https://fogata.io',
    icon: 'https://fogata.io/favicon.ico',
    category: 'defi',
    featured: true,
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
    id: 'koiner',
    name: 'Koiner',
    description: 'Block explorer and analytics for Koinos',
    url: 'https://koiner.app',
    icon: 'https://koiner.app/favicon.ico',
    category: 'tools',
    featured: true,
  },
  {
    id: 'koinosblocks',
    name: 'Koinos Blocks',
    description: 'Block explorer for the Koinos blockchain',
    url: 'https://koinosblocks.com',
    icon: 'https://koinosblocks.com/favicon.ico',
    category: 'tools',
  },
  {
    id: 'burnkoin',
    name: 'BurnKoin',
    description: 'Proof of burn mining for Koinos',
    url: 'https://burnkoin.com',
    icon: 'https://burnkoin.com/favicon.ico',
    category: 'defi',
  },
  {
    id: 'kanvas',
    name: 'Kanvas',
    description: 'Collaborative pixel art canvas on Koinos',
    url: 'https://kanvas.app',
    icon: 'https://kanvas.app/favicon.ico',
    category: 'social',
  },
  {
    id: 'nicknames',
    name: 'Nicknames',
    description: 'Register human-readable names for your address',
    url: 'https://kap.domains',
    icon: 'https://kap.domains/favicon.ico',
    category: 'tools',
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
