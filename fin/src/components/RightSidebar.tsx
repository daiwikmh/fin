'use client';

import { Wallet, ChevronLeft, ChevronRight } from 'lucide-react';

interface RightSidebarProps {
  isVisible: boolean;
  onToggle: () => void;
}

export default function RightSidebar({ isVisible, onToggle }: RightSidebarProps) {
  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="sidebar-toggle right"
        style={{ right: isVisible ? '320px' : '0px' }}
      >
        {isVisible ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className={`sidebar sidebar-right ${!isVisible ? 'hidden' : ''}`}>
        {/* Portfolio Header */}
        <div className="sidebar-header">
          <h3 className="sidebar-title">Agentic Actions</h3>
        </div>

        {/* Connect Wallet CTA */}
        <div className="portfolio-content">
          <div className="portfolio-cta">
            {/* Icon */}
            <div className="portfolio-icon-wrapper">
              <div className="portfolio-icon-bg">
                <div className="portfolio-icon-gradient"></div>
                <div className="portfolio-icon">
                  <Wallet className="w-12 h-12" />
                </div>
              </div>
            </div>

            <h4 className="portfolio-title">Connect OpenClaw</h4>
            <p className="portfolio-description">
              Connect your Openclaw to start your agentic journey
            </p>

            <button className="connect-wallet-btn">Connect telegram</button>

            {/* Stats Preview */}
          </div>
        </div>
      </div>
    </>
  );
}
