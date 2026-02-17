'use client';

import { useEffect, useRef } from 'react';

export default function ChartSection() {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    let chart: any = null;

    const initChart = async () => {
      const { createChart } = await import('lightweight-charts');

      chart = createChart(chartContainerRef.current!, {
        layout: {
          background: { color: '#060606' },
          textColor: '#a0a0a0',
        },
        grid: {
          vertLines: { color: '#1a1a1a' },
          horzLines: { color: '#1a1a1a' },
        },
        width: chartContainerRef.current!.clientWidth,
        height: 500,
        timeScale: {
          borderColor: '#1a1a1a',
          timeVisible: true,
        },
        rightPriceScale: {
          borderColor: '#1a1a1a',
        },
        crosshair: {
          vertLine: {
            color: '#2a2a2a',
            labelBackgroundColor: '#00ff94',
          },
          horzLine: {
            color: '#2a2a2a',
            labelBackgroundColor: '#00ff94',
          },
        },
      });

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#00ff94',
        downColor: '#ff4d4d',
        borderUpColor: '#00ff94',
        borderDownColor: '#ff4d4d',
        wickUpColor: '#00ff94',
        wickDownColor: '#ff4d4d',
      });

      const data = generateSampleData();
      candlestickSeries.setData(data);
      chart.timeScale().fitContent();

      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    };

    initChart();

    return () => {
      if (chart) {
        chart.remove();
      }
    };
  }, []);

  return (
    <div className="chart-section">
      {/* Chart Header */}
      <div className="chart-header">
        <div className="chart-info">
          <div className="chart-pair-info">
            <h3>WETH/USDC</h3>
            <div className="chart-price">$1,968.18</div>
          </div>
          <div className="chart-stats">
            <div className="chart-stat-item">
              <div className="chart-stat-label">24h Change</div>
              <div className="chart-stat-value negative">-$46.89 (-2.34%)</div>
            </div>
            <div className="chart-stat-item">
              <div className="chart-stat-label">24h High</div>
              <div className="chart-stat-value">$2,015.07</div>
            </div>
            <div className="chart-stat-item">
              <div className="chart-stat-label">24h Low</div>
              <div className="chart-stat-value">$1,954.21</div>
            </div>
            <div className="chart-stat-item">
              <div className="chart-stat-label">24h Volume</div>
              <div className="chart-stat-value">32.14M</div>
            </div>
          </div>
        </div>
        <div className="chart-timeframe-selector">
          <button className="timeframe-btn">1m</button>
          <button className="timeframe-btn">5m</button>
          <button className="timeframe-btn active">15m</button>
          <button className="timeframe-btn">1h</button>
          <button className="timeframe-btn">4h</button>
          <button className="timeframe-btn">1D</button>
        </div>
      </div>

      {/* Chart */}
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}

function generateSampleData() {
  const data = [];
  const basePrice = 1968;
  const now = Math.floor(Date.now() / 1000);
  const interval = 900; // 15 minutes

  for (let i = 200; i >= 0; i--) {
    const time = now - i * interval;
    const volatility = Math.random() * 20 - 10;
    const open = basePrice + volatility;
    const close = open + (Math.random() * 30 - 15);
    const high = Math.max(open, close) + Math.random() * 10;
    const low = Math.min(open, close) - Math.random() * 10;

    data.push({
      time,
      open,
      high,
      low,
      close,
    });
  }

  return data;
}
