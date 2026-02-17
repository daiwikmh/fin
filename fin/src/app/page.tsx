'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import LeftSidebar from '@/components/LeftSidebar';
import RightSidebar from '@/components/RightSidebar';
import ChartSection from '@/components/ChartSection';
import TradingTerminal from '@/components/TradingTerminal';

export default function Home() {
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);

  return (
    <div className="min-h-screen bg-[#060606]">
      {/* Header */}
      <Header />

      {/* Main Layout */}
      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Sidebar - Market List */}
        <LeftSidebar
          isVisible={showLeftSidebar}
          onToggle={() => setShowLeftSidebar(!showLeftSidebar)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chart Section */}
          <div className="p-6">
            <ChartSection />
          </div>

          {/* Trading Terminal */}
          <div className="flex-1 overflow-y-auto">
            <TradingTerminal />
          </div>
        </div>

        {/* Right Sidebar - Portfolio */}
        <RightSidebar
          isVisible={showRightSidebar}
          onToggle={() => setShowRightSidebar(!showRightSidebar)}
        />
      </div>
    </div>
  );
}
