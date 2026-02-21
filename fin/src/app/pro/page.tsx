'use client';

import Header from '@/components/Header';

export default function ProPage() {
  return (
    <div className="min-h-screen bg-[#060606]">
      <Header />
      <div
        className="flex flex-col items-center justify-center h-[calc(100vh-73px)]"
        style={{ gap: '0.5rem' }}
      >
        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>
          Pro
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)' }}>
          Advanced analytics &amp; multi-account management coming soon
        </div>
      </div>
    </div>
  );
}
