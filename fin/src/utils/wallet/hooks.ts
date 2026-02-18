import { useState, useEffect } from 'react';
import { StellarWalletsKit, getCurrentNetwork, switchNetwork, type NetworkType } from './config';
import { KitEventType } from "@creit-tech/stellar-wallets-kit/types";

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [network, setNetwork] = useState<NetworkType>('TESTNET');

  useEffect(() => {
    // Set initial network
    setNetwork(getCurrentNetwork());

    // Subscribe to wallet state updates
    const sub1 = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event: any) => {
      setAddress(event.payload.address || null);
      setIsConnecting(false);
    });

    // Subscribe to disconnect events
    const sub2 = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
      setAddress(null);
      setIsConnecting(false);
    });

    // Check if already connected
    checkConnection();

    // Cleanup subscriptions
    return () => {
      sub1?.();
      sub2?.();
    };
  }, []);

  const checkConnection = async () => {
    try {
      const { address: walletAddress } = await StellarWalletsKit.getAddress();
      if (walletAddress) {
        setAddress(walletAddress);
      }
    } catch (error) {
      // Not connected yet, which is fine
    }
  };

  const connectWallet = async () => {
    try {
      setIsConnecting(true);
      const { address: walletAddress } = await StellarWalletsKit.authModal();
      setAddress(walletAddress);
      setIsConnecting(false);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      await StellarWalletsKit.disconnect();
      setAddress(null);
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  const changeNetwork = async (newNetwork: NetworkType) => {
    // Disconnect wallet if connected
    if (address) {
      await disconnectWallet();
    }

    // Switch network
    switchNetwork(newNetwork);
    setNetwork(newNetwork);
  };

  const signTransaction = async (txXdr: string, networkPassphrase: string) => {
    try {
      const { address: walletAddress } = await StellarWalletsKit.getAddress();
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(txXdr, {
        networkPassphrase,
        address: walletAddress,
      });
      return signedTxXdr;
    } catch (error) {
      console.error('Failed to sign transaction:', error);
      throw error;
    }
  };

  const formatAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  return {
    address,
    isConnecting,
    isConnected: !!address,
    network,
    connectWallet,
    disconnectWallet,
    changeNetwork,
    signTransaction,
    formatAddress,
  };
}
