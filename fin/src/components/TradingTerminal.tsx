'use client';

import { useState } from 'react';
import { Settings, Zap } from 'lucide-react';

export default function TradingTerminal() {
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [buyPercentage, setBuyPercentage] = useState(0);
  const [sellPercentage, setSellPercentage] = useState(0);
  const [slippage, setSlippage] = useState('0.5');

  const percentages = [0, 25, 50, 75, 100];

  return (
    <div className="grid grid-cols-2 gap-6 px-6 py-6">
      {/* Buy Section */}
      <div className="trading-terminal">
        <div className="terminal-header">
          <h3 className="terminal-title">Buy WETH</h3>
          <button className="terminal-settings-btn">
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* From (USDC) */}
        <div className="terminal-input-group">
          <label className="terminal-label">You Pay</label>
          <div className="terminal-input-box">
            <div className="terminal-input-row">
              <input
                type="number"
                placeholder="0.00"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                className="terminal-input"
              />
              <div className="terminal-token-selector">
                <div className="terminal-token-icon bg-gradient-to-br from-green-400 to-blue-500"></div>
                <span className="terminal-token-name">USDC</span>
              </div>
            </div>
            <div className="terminal-input-footer">
              <span className="terminal-usd-value">$0.00</span>
              <button className="terminal-max-btn">Max</button>
            </div>
          </div>
        </div>

        {/* Percentage Selector */}
        <div className="percentage-selector">
          {percentages.map((pct) => (
            <button
              key={pct}
              onClick={() => setBuyPercentage(pct)}
              className={`percentage-btn ${buyPercentage === pct ? 'active' : ''}`}
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* To (WETH) */}
        <div className="terminal-input-group">
          <label className="terminal-label">You Receive</label>
          <div className="terminal-input-box">
            <div className="terminal-input-row">
              <input
                type="text"
                placeholder="0.00"
                value={buyAmount ? (parseFloat(buyAmount) / 1968.18).toFixed(6) : ''}
                readOnly
                className="terminal-input"
              />
              <div className="terminal-token-selector">
                <div className="terminal-token-icon bg-gradient-to-br from-blue-400 to-purple-600"></div>
                <span className="terminal-token-name">WETH</span>
              </div>
            </div>
            <div className="terminal-input-footer">
              <span className="terminal-usd-value">
                ${buyAmount ? parseFloat(buyAmount).toFixed(2) : '0.00'}
              </span>
            </div>
          </div>
        </div>

        {/* Trading Info */}
        <div className="trading-info">
          <div className="trading-info-row">
            <span className="trading-info-label">Slippage</span>
            <div className="slippage-options">
              <button
                onClick={() => setSlippage('0.1')}
                className={`slippage-btn ${slippage === '0.1' ? 'active' : ''}`}
              >
                0.1%
              </button>
              <button
                onClick={() => setSlippage('0.5')}
                className={`slippage-btn ${slippage === '0.5' ? 'active' : ''}`}
              >
                0.5%
              </button>
              <button
                onClick={() => setSlippage('1.0')}
                className={`slippage-btn ${slippage === '1.0' ? 'active' : ''}`}
              >
                1.0%
              </button>
            </div>
          </div>
          <div className="trading-info-row">
            <span className="trading-info-label">
              <Zap className="w-3 h-3" />
              Gas Price
            </span>
            <span className="trading-info-value">~$2.45</span>
          </div>
        </div>

        {/* Buy Button */}
        <button className="btn-buy">Buy WETH</button>
      </div>

      {/* Sell Section */}
      <div className="trading-terminal">
        <div className="terminal-header">
          <h3 className="terminal-title">Sell WETH</h3>
          <button className="terminal-settings-btn">
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* From (WETH) */}
        <div className="terminal-input-group">
          <label className="terminal-label">You Pay</label>
          <div className="terminal-input-box">
            <div className="terminal-input-row">
              <input
                type="number"
                placeholder="0.00"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                className="terminal-input"
              />
              <div className="terminal-token-selector">
                <div className="terminal-token-icon bg-gradient-to-br from-blue-400 to-purple-600"></div>
                <span className="terminal-token-name">WETH</span>
              </div>
            </div>
            <div className="terminal-input-footer">
              <span className="terminal-usd-value">
                ${sellAmount ? (parseFloat(sellAmount) * 1968.18).toFixed(2) : '0.00'}
              </span>
              <button className="terminal-max-btn">Max</button>
            </div>
          </div>
        </div>

        {/* Percentage Selector */}
        <div className="percentage-selector">
          {percentages.map((pct) => (
            <button
              key={pct}
              onClick={() => setSellPercentage(pct)}
              className={`percentage-btn ${sellPercentage === pct ? 'active' : ''}`}
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* To (USDC) */}
        <div className="terminal-input-group">
          <label className="terminal-label">You Receive</label>
          <div className="terminal-input-box">
            <div className="terminal-input-row">
              <input
                type="text"
                placeholder="0.00"
                value={sellAmount ? (parseFloat(sellAmount) * 1968.18).toFixed(2) : ''}
                readOnly
                className="terminal-input"
              />
              <div className="terminal-token-selector">
                <div className="terminal-token-icon bg-gradient-to-br from-green-400 to-blue-500"></div>
                <span className="terminal-token-name">USDC</span>
              </div>
            </div>
            <div className="terminal-input-footer">
              <span className="terminal-usd-value">
                ${sellAmount ? (parseFloat(sellAmount) * 1968.18).toFixed(2) : '0.00'}
              </span>
            </div>
          </div>
        </div>

        {/* Trading Info */}
        <div className="trading-info">
          <div className="trading-info-row">
            <span className="trading-info-label">Slippage</span>
            <div className="slippage-options">
              <button
                onClick={() => setSlippage('0.1')}
                className={`slippage-btn ${slippage === '0.1' ? 'active' : ''}`}
              >
                0.1%
              </button>
              <button
                onClick={() => setSlippage('0.5')}
                className={`slippage-btn ${slippage === '0.5' ? 'active' : ''}`}
              >
                0.5%
              </button>
              <button
                onClick={() => setSlippage('1.0')}
                className={`slippage-btn ${slippage === '1.0' ? 'active' : ''}`}
              >
                1.0%
              </button>
            </div>
          </div>
          <div className="trading-info-row">
            <span className="trading-info-label">
              <Zap className="w-3 h-3" />
              Gas Price
            </span>
            <span className="trading-info-value">~$2.45</span>
          </div>
        </div>

        {/* Sell Button */}
        <button className="btn-sell">Sell WETH</button>
      </div>
    </div>
  );
}
