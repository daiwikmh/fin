package matching

import (
	"fmt"
	"sort"
	"sync"
	"time"
)

// Side represents the direction of a trade order.
type Side string

const (
	Buy  Side = "buy"
	Sell Side = "sell"
)

// Order is a single resting limit order in the book.
type Order struct {
	ID        string
	UserToken string  // agent-bridge session token identifying the user
	Symbol    string  // e.g. "XLM/USDC"
	Side      Side
	Price     float64 // limit price in quote units per 1 base unit
	Amount    float64 // base asset amount
	Leverage  int     // 1 = spot, 2–20 = leveraged
	EntryAt   time.Time
}

// MatchResult records a single fill between a resting and an aggressing order.
type MatchResult struct {
	BuyOrder  Order
	SellOrder Order
	FillPrice  float64
	FillAmount float64
}

// OrderBook is a thread-safe, per-symbol central limit order book.
type OrderBook struct {
	mu     sync.Mutex
	bids   []Order // sorted descending (highest bid first)
	asks   []Order // sorted ascending  (lowest ask first)
	nextID uint64
}

// NewOrderBook creates an empty order book.
func NewOrderBook() *OrderBook {
	return &OrderBook{}
}

// AddOrder inserts an order and immediately attempts matching.
// Returns any fills produced; unmatched remainder stays in the book.
func (ob *OrderBook) AddOrder(o Order) []MatchResult {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	ob.nextID++
	o.ID = fmt.Sprintf("%d-%d", time.Now().UnixNano(), ob.nextID)
	o.EntryAt = time.Now()

	if o.Side == Buy {
		ob.bids = append(ob.bids, o)
		sort.Slice(ob.bids, func(i, j int) bool {
			return ob.bids[i].Price > ob.bids[j].Price
		})
	} else {
		ob.asks = append(ob.asks, o)
		sort.Slice(ob.asks, func(i, j int) bool {
			return ob.asks[i].Price < ob.asks[j].Price
		})
	}

	return ob.match()
}

// CancelOrder removes a resting order by ID. Returns true if found.
func (ob *OrderBook) CancelOrder(orderID string) bool {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	for i, o := range ob.bids {
		if o.ID == orderID {
			ob.bids = append(ob.bids[:i], ob.bids[i+1:]...)
			return true
		}
	}
	for i, o := range ob.asks {
		if o.ID == orderID {
			ob.asks = append(ob.asks[:i], ob.asks[i+1:]...)
			return true
		}
	}
	return false
}

// Snapshot returns a read-only copy of the top-N bids and asks.
func (ob *OrderBook) Snapshot(depth int) (bids, asks []Order) {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	n := depth
	if n > len(ob.bids) {
		n = len(ob.bids)
	}
	bids = make([]Order, n)
	copy(bids, ob.bids[:n])

	n = depth
	if n > len(ob.asks) {
		n = len(ob.asks)
	}
	asks = make([]Order, n)
	copy(asks, ob.asks[:n])
	return
}

// match runs price-time priority matching. Must be called with ob.mu held.
func (ob *OrderBook) match() []MatchResult {
	var fills []MatchResult

	for len(ob.bids) > 0 && len(ob.asks) > 0 {
		best_bid := &ob.bids[0]
		best_ask := &ob.asks[0]

		if best_bid.Price < best_ask.Price {
			break // no cross
		}

		// Fill at the resting order's price (maker price)
		fillPrice := best_ask.Price
		fillAmount := best_bid.Amount
		if best_ask.Amount < fillAmount {
			fillAmount = best_ask.Amount
		}

		fills = append(fills, MatchResult{
			BuyOrder:   *best_bid,
			SellOrder:  *best_ask,
			FillPrice:  fillPrice,
			FillAmount: fillAmount,
		})

		best_bid.Amount -= fillAmount
		best_ask.Amount -= fillAmount

		if best_bid.Amount <= 0 {
			ob.bids = ob.bids[1:]
		}
		if best_ask.Amount <= 0 {
			ob.asks = ob.asks[1:]
		}
	}

	return fills
}
