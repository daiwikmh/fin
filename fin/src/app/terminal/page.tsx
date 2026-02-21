'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import LeftSidebar from '@/components/LeftSidebar';
import RightSidebar from '@/components/RightSidebar';
import ChartSection from '@/components/ChartSection';
import TradingTerminal from '@/components/TradingTerminal';
import { useSdex } from '@/hooks/useSdex';

export default function TerminalPage() {
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);

  const sdex = useSdex();

  const baseToken = sdex.baseAsset?.code ?? 'XLM';
  const quoteToken = sdex.quoteAsset?.code ?? 'USDC';

  return (
    <div className="min-h-screen bg-[#060606]">
      <Header />

      <div className="flex h-[calc(100vh-73px)] gap-2 px-2 py-2">
        <LeftSidebar
          isVisible={showLeftSidebar}
          onToggle={() => setShowLeftSidebar(!showLeftSidebar)}
          selectedPair={sdex.selectedPair}
          onSelectPair={sdex.selectPair}
          network={sdex.network}
        />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="shrink-0 h-[450px] px-6 pt-6">
            <ChartSection pair={sdex.selectedPair} />
          </div>

          {/* Order Book + Open Orders */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <TradingTerminal
              baseToken={baseToken}
              quoteToken={quoteToken}
              orderBook={sdex.orderBook}
              openOffers={sdex.openOffers}
              isLoadingOrderBook={sdex.isLoadingOrderBook}
              isSubmitting={sdex.isSubmitting}
              onCancelOrder={sdex.cancelOrder}
            />
          </div>
        </div>

        {/* Right Sidebar — Trade (manual) / Agent toggle */}
        <RightSidebar
          isVisible={showRightSidebar}
          onToggle={() => setShowRightSidebar(!showRightSidebar)}
          baseToken={baseToken}
          quoteToken={quoteToken}
          orderBook={sdex.orderBook}
          isSubmitting={sdex.isSubmitting}
          lastResult={sdex.lastResult}
          selectedPair={sdex.selectedPair}
          network={sdex.network}
          onPlaceOrder={sdex.placeOrder}
          onMarketOrder={sdex.submitMarketOrder}
          onClearResult={sdex.clearResult}
        />
      </div>
    </div>
  );
}
