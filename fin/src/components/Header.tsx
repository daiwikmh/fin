'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { initWalletKit, useWallet } from '@/utils/wallet';

export default function Header() {
  const { address, isConnecting, isConnected, network, connectWallet, disconnectWallet, changeNetwork, formatAddress } = useWallet();
  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

  // Initialize wallet kit on component mount
  useEffect(() => {
    initWalletKit();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowNetworkDropdown(false);
    if (showNetworkDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showNetworkDropdown]);

  const handleNetworkChange = async (newNetwork: 'MAINNET' | 'TESTNET') => {
    setShowNetworkDropdown(false);
    if (newNetwork !== network) {
      await changeNetwork(newNetwork);
    }
  };

  const getNetworkDisplay = () => {
    return network === 'MAINNET' ? 'Mainnet' : 'Testnet';
  };

  const getNetworkIcon = () => {
    return network === 'MAINNET' ? '🌐' : '🧪';
  };

  return (
    <header className="header">
      <div className="header-container">
        {/* Logo and Navigation */}
        <div className="flex items-center gap-6">
          <div className="header-logo">Arena</div>
          <nav className="header-nav">
            <button className="header-nav-item">Swap</button>
            <button className="header-nav-item active">Pro</button>
            <button className="header-nav-item">Aqua</button>
            <button className="header-nav-item">Portfolio</button>
          </nav>
        </div>

        {/* Network Selector and Connect Wallet */}
        <div className="flex items-center gap-4">
          {/* Network Selector */}
          <div style={{ position: 'relative' }}>
            <button
              className="network-selector"
              onClick={(e) => {
                e.stopPropagation();
                setShowNetworkDropdown(!showNetworkDropdown);
              }}
            >
              <span style={{ fontSize: '16px' }}>{getNetworkIcon()}</span>
              <span className="network-name">Stellar {getNetworkDisplay()}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {/* Network Dropdown */}
            {showNetworkDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  background: '#1a1b1e',
                  border: '1px solid #2d2e33',
                  borderRadius: '8px',
                  minWidth: '180px',
                  zIndex: 1000,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => handleNetworkChange('MAINNET')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: network === 'MAINNET' ? '#2d2e33' : 'transparent',
                    border: 'none',
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                  }}
                  onMouseEnter={(e) => {
                    if (network !== 'MAINNET') {
                      e.currentTarget.style.background = '#25262b';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (network !== 'MAINNET') {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <span>🌐</span>
                  <span>Mainnet</span>
                  {network === 'MAINNET' && <span style={{ marginLeft: 'auto', color: '#4ade80' }}>✓</span>}
                </button>
                <button
                  onClick={() => handleNetworkChange('TESTNET')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: network === 'TESTNET' ? '#2d2e33' : 'transparent',
                    border: 'none',
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                  }}
                  onMouseEnter={(e) => {
                    if (network !== 'TESTNET') {
                      e.currentTarget.style.background = '#25262b';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (network !== 'TESTNET') {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <span>🧪</span>
                  <span>Testnet</span>
                  {network === 'TESTNET' && <span style={{ marginLeft: 'auto', color: '#4ade80' }}>✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Stellar Wallet Button */}
          {isConnected ? (
            <button
              className="connect-wallet-btn"
              onClick={disconnectWallet}
              title={address || ''}
            >
              {formatAddress(address || '')}
            </button>
          ) : (
            <button
              className="connect-wallet-btn"
              onClick={connectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
