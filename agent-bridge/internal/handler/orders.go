package handler

import (
	"encoding/json"
	"net/http"

	"agent-bridge/internal/matching"
)

// OrdersHandler exposes the matching engine's order placement over HTTP.
// POST /api/orders — place a limit order
// GET  /api/orders?symbol=XLM/USDC&depth=10 — view the live order book
type OrdersHandler struct {
	Engine *matching.Engine
}

type placeOrderRequest struct {
	Token    string  `json:"token"`
	Symbol   string  `json:"symbol"`
	Side     string  `json:"side"`   // "buy" | "sell"
	Price    float64 `json:"price"`  // limit price
	Amount   float64 `json:"amount"` // base asset amount
	Leverage int     `json:"leverage"` // 1 = spot
}

type placeOrderResponse struct {
	OrderID string             `json:"orderId"`
	Fills   int                `json:"fills"`
	Results []fillSummary      `json:"results,omitempty"`
}

type fillSummary struct {
	BuyToken  string  `json:"buyToken"`
	SellToken string  `json:"sellToken"`
	Price     float64 `json:"price"`
	Amount    float64 `json:"amount"`
}

func (h *OrdersHandler) Handle(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		h.place(w, r)
	case http.MethodGet:
		h.snapshot(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *OrdersHandler) place(w http.ResponseWriter, r *http.Request) {
	var req placeOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request body", http.StatusBadRequest)
		return
	}
	if req.Token == "" || req.Symbol == "" || req.Amount <= 0 || req.Price <= 0 {
		http.Error(w, "token, symbol, amount, price are required", http.StatusBadRequest)
		return
	}
	if req.Leverage < 1 {
		req.Leverage = 1
	}

	o := matching.Order{
		UserToken: req.Token,
		Symbol:    req.Symbol,
		Side:      matching.Side(req.Side),
		Price:     req.Price,
		Amount:    req.Amount,
		Leverage:  req.Leverage,
	}

	fills, err := h.Engine.PlaceOrder(o)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	resp := placeOrderResponse{Fills: len(fills)}
	for _, f := range fills {
		resp.Results = append(resp.Results, fillSummary{
			BuyToken:  f.BuyOrder.UserToken,
			SellToken: f.SellOrder.UserToken,
			Price:     f.FillPrice,
			Amount:    f.FillAmount,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

type bookLevel struct {
	Price  float64 `json:"price"`
	Amount float64 `json:"amount"`
}

type bookSnapshot struct {
	Symbol string      `json:"symbol"`
	Bids   []bookLevel `json:"bids"`
	Asks   []bookLevel `json:"asks"`
}

func (h *OrdersHandler) snapshot(w http.ResponseWriter, r *http.Request) {
	symbol := r.URL.Query().Get("symbol")
	if symbol == "" {
		symbol = "XLM/USDC"
	}
	depth := 10

	bids, asks := h.Engine.BookSnapshot(symbol, depth)

	snap := bookSnapshot{Symbol: symbol}
	for _, o := range bids {
		snap.Bids = append(snap.Bids, bookLevel{Price: o.Price, Amount: o.Amount})
	}
	for _, o := range asks {
		snap.Asks = append(snap.Asks, bookLevel{Price: o.Price, Amount: o.Amount})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snap)
}
