// Package matching provides an in-memory matching engine with a mock price feed
// that simulates a TradingView mark-price stream.
package matching

import (
	"context"
	"math/rand"
	"sync"
	"time"
)

// PriceSync holds the current mark price for each trading symbol and simulates
// a TradingView webhook by randomly drifting prices every second.
type PriceSync struct {
	mu     sync.RWMutex
	prices map[string]float64 // symbol -> mark price
}

// NewPriceSync creates a PriceSync seeded with sane defaults.
func NewPriceSync() *PriceSync {
	return &PriceSync{
		prices: map[string]float64{
			"XLM/USDC": 0.10, // seed: 0.10 USDC per XLM
		},
	}
}

// GetMarkPrice returns the current mark price for a symbol (0 if unknown).
func (ps *PriceSync) GetMarkPrice(symbol string) float64 {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	return ps.prices[symbol]
}

// SetMarkPrice is called by an external price feed (e.g. a TradingView webhook
// forwarded to POST /api/price/update) to push a new authoritative mark price.
func (ps *PriceSync) SetMarkPrice(symbol string, price float64) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	ps.prices[symbol] = price
}

// AllPrices returns a snapshot copy of all mark prices.
func (ps *PriceSync) AllPrices() map[string]float64 {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	out := make(map[string]float64, len(ps.prices))
	for k, v := range ps.prices {
		out[k] = v
	}
	return out
}

// RunMockUpdater simulates a live TradingView price feed by randomly drifting
// each symbol's price ±0.5% every second until ctx is cancelled.
// Replace or supplement this with a real webhook in production.
func (ps *PriceSync) RunMockUpdater(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ps.mu.Lock()
			for sym, price := range ps.prices {
				// drift: uniform random in [-0.5%, +0.5%]
				drift := (rand.Float64()*1.0 - 0.5) / 100.0
				ps.prices[sym] = price * (1 + drift)
			}
			ps.mu.Unlock()
		}
	}
}
