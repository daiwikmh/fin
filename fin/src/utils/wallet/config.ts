import { StellarWalletsKit } from "@creit-tech/stellar-wallets-kit/sdk";
import { defaultModules } from '@creit-tech/stellar-wallets-kit/modules/utils';
import { SwkAppDarkTheme } from "@creit-tech/stellar-wallets-kit/types";
import { Networks } from '@creit-tech/stellar-wallets-kit';

// Network configuration
export const STELLAR_NETWORKS = {
  MAINNET: Networks.PUBLIC,
  TESTNET: Networks.TESTNET,
} as const;

export type NetworkType = 'MAINNET' | 'TESTNET';

// Get stored network or default to testnet
function getStoredNetwork(): NetworkType {
  if (typeof window === 'undefined') return 'TESTNET';
  return (localStorage.getItem('stellar_network') as NetworkType) || 'TESTNET';
}

// Store network preference
export function setStoredNetwork(network: NetworkType) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('stellar_network', network);
}

// Wallet kit configuration
export function getWalletKitConfig(network: NetworkType = 'TESTNET') {
  return {
    modules: defaultModules(),
    network: STELLAR_NETWORKS[network],
    theme: SwkAppDarkTheme,
    authModal: {
      showInstallLabel: true,
      hideUnsupportedWallets: false,
    },
  };
}

// Initialize the wallet kit
let isInitialized = false;
let currentNetwork: NetworkType = 'TESTNET';

export function initWalletKit(network?: NetworkType) {
  // Only initialize in browser environment (not during SSR)
  if (typeof window === 'undefined') {
    return;
  }

  const networkToUse = network || getStoredNetwork();
  currentNetwork = networkToUse;

  try {
    StellarWalletsKit.init(getWalletKitConfig(networkToUse));
    isInitialized = true;
  } catch (error) {
    console.error('Failed to initialize Stellar Wallets Kit:', error);
  }
}

export function getCurrentNetwork(): NetworkType {
  return currentNetwork;
}

export function switchNetwork(network: NetworkType) {
  currentNetwork = network;
  setStoredNetwork(network);

  // Reinitialize the wallet kit with new network
  if (typeof window !== 'undefined') {
    isInitialized = false;
    initWalletKit(network);
  }
}

export { StellarWalletsKit };
