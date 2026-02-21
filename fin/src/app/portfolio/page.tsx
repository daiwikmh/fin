'use client';

import Header from '@/components/Header';

export default function PortfolioPage() {
  return (
    <div className="min-h-screen bg-[#060606]">
      <Header />
      <div
        className="flex flex-col items-center justify-center h-[calc(100vh-73px)]"
        style={{ gap: '0.5rem' }}
      >
        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>
          Portfolio
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)' }}>
          Portfolio tracking &amp; P&amp;L analytics coming soon
        </div>
      </div>
    </div>
  );
}
