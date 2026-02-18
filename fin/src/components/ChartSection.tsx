'use client';

import { useEffect, useRef, memo } from 'react';
import {
  TRADINGVIEW_SCRIPT_URL,
  defaultTradingViewConfig,
  getTradingViewSymbol,
} from '@/utils/tradingview';

interface ChartSectionProps {
  pair?: string;
}

function ChartSection({ pair = 'XLM/USDC' }: ChartSectionProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    // Clear previous widget
    container.current.innerHTML = '';

    // Re-create the inner widget div
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = 'calc(100% - 32px)';
    widgetDiv.style.width = '100%';
    container.current.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = TRADINGVIEW_SCRIPT_URL;
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      ...defaultTradingViewConfig,
      symbol: getTradingViewSymbol(pair),
    });
    container.current.appendChild(script);
  }, [pair]);

  return (
    <div
      className="tradingview-widget-container"
      ref={container}
      style={{ height: '450px', width: '100%' }}
    />
  );
}

export default memo(ChartSection);
