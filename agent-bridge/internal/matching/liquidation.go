package matching

import (
	"context"
	"log"
	"sync"
	"time"
)

// OpenPosition tracks an active synthetic trade for liquidation monitoring.
type OpenPosition struct {
	UserToken        string
	Symbol           string  // e.g. "XLM/USDC"
	Side             string  // "long" | "short"
	EntryPrice       float64 // mark price when position was opened
	Leverage         int
	CollateralAmount float64 // USDC collateral deposited (7-decimal scaled: 100 USDC = 100.0)
	DebtAmount       float64 // notional = collateral * leverage
}

// SettleFunc is called by the liquidation engine to request a PnL settlement.
// pnl > 0 means the user won; pnl < 0 means funds are seized from the user.
// The implementation should invoke AgentVault.settle_pnl on-chain.
type SettleFunc func(ctx context.Context, userToken string, symbol string, pnl float64) error

// LiquidationEngine monitors open positions against the live mark price and
// triggers settlement when a position crosses the 90% collateral-loss threshold.
type LiquidationEngine struct {
	mu        sync.RWMutex
	positions map[string]*OpenPosition // userToken -> position
	prices    *PriceSync
	settle    SettleFunc
	interval  time.Duration
}

// NewLiquidationEngine creates a liquidation engine.
// settle is called whenever a position must be closed by force.
func NewLiquidationEngine(prices *PriceSync, settle SettleFunc) *LiquidationEngine {
	return &LiquidationEngine{
		positions: make(map[string]*OpenPosition),
		prices:    prices,
		settle:    settle,
		interval:  5 * time.Second,
	}
}

// AddPosition registers a new open trade for monitoring.
func (le *LiquidationEngine) AddPosition(p *OpenPosition) {
	le.mu.Lock()
	defer le.mu.Unlock()
	le.positions[p.UserToken] = p
}

// RemovePosition removes a closed or liquidated trade from monitoring.
func (le *LiquidationEngine) RemovePosition(userToken string) {
	le.mu.Lock()
	defer le.mu.Unlock()
	delete(le.positions, userToken)
}

// GetPosition returns a copy of the position or nil.
func (le *LiquidationEngine) GetPosition(userToken string) *OpenPosition {
	le.mu.RLock()
	defer le.mu.RUnlock()
	p, ok := le.positions[userToken]
	if !ok {
		return nil
	}
	cp := *p
	return &cp
}

// Run starts the background liquidation check loop until ctx is cancelled.
func (le *LiquidationEngine) Run(ctx context.Context) {
	ticker := time.NewTicker(le.interval)
	defer ticker.Stop()
	log.Println("[liquidation] engine started, check interval:", le.interval)
	for {
		select {
		case <-ctx.Done():
			log.Println("[liquidation] engine stopped")
			return
		case <-ticker.C:
			le.checkAll(ctx)
		}
	}
}

// checkAll iterates every monitored position and liquidates if appropriate.
//
// Liquidation condition (90% collateral-loss threshold):
//   long:  unrealisedLoss = (entryPrice - markPrice) / entryPrice × leverage × collateral
//   short: unrealisedLoss = (markPrice - entryPrice) / entryPrice × leverage × collateral
//   trigger when unrealisedLoss >= 0.90 × collateral
func (le *LiquidationEngine) checkAll(ctx context.Context) {
	le.mu.RLock()
	// copy keys so we can release the read lock before calling settle
	tokens := make([]string, 0, len(le.positions))
	for t := range le.positions {
		tokens = append(tokens, t)
	}
	le.mu.RUnlock()

	for _, token := range tokens {
		le.mu.RLock()
		pos, ok := le.positions[token]
		if !ok {
			le.mu.RUnlock()
			continue
		}
		p := *pos // local copy
		le.mu.RUnlock()

		markPrice := le.prices.GetMarkPrice(p.Symbol)
		if markPrice <= 0 || p.EntryPrice <= 0 {
			continue
		}

		var unrealisedLoss float64
		switch p.Side {
		case "long":
			if markPrice < p.EntryPrice {
				pct := (p.EntryPrice - markPrice) / p.EntryPrice
				unrealisedLoss = pct * float64(p.Leverage) * p.CollateralAmount
			}
		case "short":
			if markPrice > p.EntryPrice {
				pct := (markPrice - p.EntryPrice) / p.EntryPrice
				unrealisedLoss = pct * float64(p.Leverage) * p.CollateralAmount
			}
		}

		threshold := 0.90 * p.CollateralAmount
		if unrealisedLoss < threshold {
			continue
		}

		// ── Liquidation triggered ─────────────────────────────────────────────
		log.Printf(
			"[liquidation] LIQUIDATING %s | symbol=%s side=%s entry=%.6f mark=%.6f loss=%.4f collateral=%.4f",
			p.UserToken, p.Symbol, p.Side, p.EntryPrice, markPrice, unrealisedLoss, p.CollateralAmount,
		)

		// Seize the full collateral: pnl = -collateralAmount
		pnl := -p.CollateralAmount
		if err := le.settle(ctx, p.UserToken, p.Symbol, pnl); err != nil {
			log.Printf("[liquidation] settle error for %s: %v", p.UserToken, err)
			continue
		}

		le.RemovePosition(p.UserToken)
		log.Printf("[liquidation] position closed for %s (liquidated)", p.UserToken)
	}
}
