'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import LeftSidebar from '@/components/LeftSidebar';
import RightSidebar from '@/components/RightSidebar';
import ChartSection from '@/components/ChartSection';
import TradingTerminal from '@/components/TradingTerminal';
import { useSdex } from '@/hooks/useSdex';

export default function Home() {
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);

  const sdex = useSdex();

  const baseToken = sdex.baseAsset?.code ?? 'XLM';
  const quoteToken = sdex.quoteAsset?.code ?? 'USDC';

  return (
    <div className="min-h-screen bg-[#060606]">
      {/* Header */}
      <Header />

      {/* Main Layout */}
      <div className="flex h-[calc(100vh-73px)] gap-2 px-2 py-2">
        {/* Left Sidebar - Market List */}
        <LeftSidebar
          isVisible={showLeftSidebar}
          onToggle={() => setShowLeftSidebar(!showLeftSidebar)}
          selectedPair={sdex.selectedPair}
          onSelectPair={sdex.selectPair}
          network={sdex.network}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Chart Section — fixed 400px, never shrinks */}
          <div className="shrink-0 h-[300px] px-6 pt-6">
            <ChartSection pair={sdex.selectedPair} />
          </div>

          {/* Trading Terminal — takes remaining height, scrolls internally */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <TradingTerminal
              baseToken={baseToken}
              quoteToken={quoteToken}
              orderBook={sdex.orderBook}
              openOffers={sdex.openOffers}
              isLoadingOrderBook={sdex.isLoadingOrderBook}
              isSubmitting={sdex.isSubmitting}
              lastResult={sdex.lastResult}
              onPlaceOrder={sdex.placeOrder}
              onMarketOrder={sdex.submitMarketOrder}
              onCancelOrder={sdex.cancelOrder}
              onClearResult={sdex.clearResult}
            />
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
