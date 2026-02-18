import type { StellarAsset } from '@/types/sdex.types';

export type NetworkId = 'MAINNET' | 'TESTNET';

export interface NetworkConfig {
  horizonUrl: string;
  networkPassphrase: string;
  networkId: NetworkId;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  TESTNET: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    networkId: 'TESTNET',
  },
  MAINNET: {
    horizonUrl: 'https://horizon.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    networkId: 'MAINNET',
  },
};

// Read network from localStorage (same key as wallet config), fallback to TESTNET
let currentNetwork: NetworkId = 'TESTNET';

function readStoredNetwork(): NetworkId {
  if (typeof window === 'undefined') return 'TESTNET';
  return (localStorage.getItem('stellar_network') as NetworkId) || 'TESTNET';
}

export function setCurrentNetwork(network: NetworkId) {
  currentNetwork = network;
}

export function getNetwork(): NetworkConfig {
  return NETWORKS[currentNetwork];
}

export function getCurrentNetworkId(): NetworkId {
  return currentNetwork;
}

// Sync from localStorage on module load (client-side only)
if (typeof window !== 'undefined') {
  currentNetwork = readStoredNetwork();
}

// ── Asset definitions per network ──────────────────────────────────────

const ASSETS_TESTNET: Record<string, StellarAsset> = {
  XLM: {
    code: 'XLM',
    issuer: null,
    name: 'Stellar Lumens',
    decimals: 7,
  },
  USDC: {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    name: 'USD Coin',
    decimals: 7,
  },
  SRT: {
    code: 'SRT',
    issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B',
    name: 'StellarRT Token',
    decimals: 7,
  },
};

const ASSETS_MAINNET: Record<string, StellarAsset> = {
  XLM: {
    code: 'XLM',
    issuer: null,
    name: 'Stellar Lumens',
    decimals: 7,
  },
  USDC: {
    code: 'USDC',
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    name: 'USD Coin',
    decimals: 7,
  },
  AQUA: {
    code: 'AQUA',
    issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67TKA',
    name: 'Aquarius',
    decimals: 7,
  },
};

export function getAssets(): Record<string, StellarAsset> {
  return currentNetwork === 'TESTNET' ? ASSETS_TESTNET : ASSETS_MAINNET;
}

export function getAsset(code: string): StellarAsset | undefined {
  return getAssets()[code];
}

/**
 * Look up a pair from a string like "XLM/USDC"
 * Returns [base, quote] or undefined if either asset is unknown.
 */
export function getAssetPair(
  symbol: string,
): [StellarAsset, StellarAsset] | undefined {
  const [baseCode, quoteCode] = symbol.split('/');
  const base = getAsset(baseCode);
  const quote = getAsset(quoteCode);
  if (!base || !quote) return undefined;
  return [base, quote];
}
