package matching

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
)

// Engine ties together the order books, price feed, and liquidation engine
// into a single entry-point used by HTTP handlers.
type Engine struct {
	mu          sync.Mutex
	books       map[string]*OrderBook // symbol -> book
	Prices      *PriceSync
	Liquidation *LiquidationEngine

	// settleURL is the internal endpoint that the engine POSTs settlement
	// requests to. In production this would be an admin-authenticated route
	// that builds and submits the AgentVault.settle_pnl Soroban transaction.
	settleURL string

	// adminSecret is sent as a bearer token on settlement HTTP requests.
	adminSecret string
}

// NewEngine creates a matching engine.
// settleURL e.g. "http://localhost:3000/api/admin/settle"
// adminSecret is passed as "Authorization: Bearer <secret>" on settle calls.
func NewEngine(settleURL, adminSecret string) *Engine {
	ps := NewPriceSync()

	e := &Engine{
		books:       make(map[string]*OrderBook),
		Prices:      ps,
		settleURL:   settleURL,
		adminSecret: adminSecret,
	}

	settle := func(ctx context.Context, userToken, symbol string, pnl float64) error {
		return e.submitSettle(ctx, userToken, symbol, pnl)
	}

	e.Liquidation = NewLiquidationEngine(ps, settle)
	return e
}

// Start launches background goroutines (price mock, liquidation loop).
func (e *Engine) Start(ctx context.Context) {
	go e.Prices.RunMockUpdater(ctx)
	go e.Liquidation.Run(ctx)
	log.Println("[engine] matching engine started")
}

// PlaceOrder adds an order to the appropriate book and returns any fills.
func (e *Engine) PlaceOrder(o Order) ([]MatchResult, error) {
	if o.Symbol == "" || o.Amount <= 0 || o.Price <= 0 {
		return nil, fmt.Errorf("invalid order: symbol, amount, and price are required")
	}
	book := e.getBook(o.Symbol)
	fills := book.AddOrder(o)
	if len(fills) > 0 {
		log.Printf("[engine] %d fill(s) for %s %s %.4f @ %.6f",
			len(fills), o.Symbol, o.Side, o.Amount, o.Price)
	}
	return fills, nil
}

// CancelOrder removes a resting order from its book. Returns error if not found.
func (e *Engine) CancelOrder(symbol, orderID string) error {
	book := e.getBook(symbol)
	if !book.CancelOrder(orderID) {
		return fmt.Errorf("order %s not found in %s book", orderID, symbol)
	}
	return nil
}

// BookSnapshot returns the top-N bids and asks for a symbol.
func (e *Engine) BookSnapshot(symbol string, depth int) (bids, asks []Order) {
	return e.getBook(symbol).Snapshot(depth)
}

// getBook returns (or lazily creates) the order book for a symbol.
func (e *Engine) getBook(symbol string) *OrderBook {
	e.mu.Lock()
	defer e.mu.Unlock()
	if _, ok := e.books[symbol]; !ok {
		e.books[symbol] = NewOrderBook()
	}
	return e.books[symbol]
}

// submitSettle POSTs a settlement request to the configured admin endpoint.
// The endpoint is responsible for building and submitting the Soroban
// AgentVault.settle_pnl transaction with the admin key.
//
// Request body:
//
//	{ "userToken": "...", "symbol": "XLM/USDC", "pnl": -90.0 }
func (e *Engine) submitSettle(ctx context.Context, userToken, symbol string, pnl float64) error {
	payload := map[string]interface{}{
		"userToken": userToken,
		"symbol":    symbol,
		"pnl":       pnl,
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.settleURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("settle request build: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if e.adminSecret != "" {
		req.Header.Set("Authorization", "Bearer "+e.adminSecret)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("settle http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("settle endpoint returned HTTP %d", resp.StatusCode)
	}
	log.Printf("[engine] settle OK userToken=%s pnl=%.4f", userToken, pnl)
	return nil
}
