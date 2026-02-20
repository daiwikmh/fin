'use client';

import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { getTradingPairs } from '@/configs/tradingPairs';

interface LeftSidebarProps {
  isVisible: boolean;
  onToggle: () => void;
  selectedPair: string;
  onSelectPair: (symbol: string) => void;
  network: string;
}

export default function LeftSidebar({ isVisible, onToggle, selectedPair, onSelectPair, network }: LeftSidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const pairs = getTradingPairs();
  const filteredPairs = pairs.filter((pair) =>
    pair.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <div className={`sidebar sidebar-left ${!isVisible ? 'hidden' : ''}`}>
        {/* Search Bar */}
        <div className="sidebar-header">
          <div className="sidebar-search">
            <Search className="sidebar-search-icon" />
            <input
              type="text"
              placeholder="Search pairs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Trading Pairs List */}
        <div className="trading-pair-list">
          {filteredPairs.map((pair) => (
            <button
              key={pair.symbol}
              onClick={() => onSelectPair(pair.symbol)}
              className={`trading-pair-item ${selectedPair === pair.symbol ? 'active' : ''}`}
            >
              <div className="trading-pair-info">
                {/* Token Icons */}
                <div className="trading-pair-icons">
                  <div className="trading-pair-icon"></div>
                  <div className="trading-pair-icon"></div>
                </div>
                <div className="trading-pair-details">
                  <div className="trading-pair-symbol">{pair.symbol}</div>
                  <div className="trading-pair-volume">SDEX</div>
                </div>
              </div>

              <div className="trading-pair-price-info">
                <div className="trading-pair-price">
                  {pair.price > 0
                    ? pair.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 })
                    : '--'}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="sidebar-toggle left"
        style={{ left: isVisible ? '260px' : '0px' }}
      >
        {isVisible ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </>
  );
}
