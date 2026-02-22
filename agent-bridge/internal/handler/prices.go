package handler

import (
	"encoding/json"
	"net/http"
	"os"

	"agent-bridge/internal/matching"
)

// PricesHandler exposes the mark price feed over HTTP.
// GET  /api/prices           — return all current mark prices
// POST /api/price/update     — admin endpoint to push a new mark price
//
// The POST endpoint simulates the TradingView webhook: in production you would
// point your TradingView alert webhook at this URL.
type PricesHandler struct {
	Engine *matching.Engine
}

func (h *PricesHandler) Get(w http.ResponseWriter, r *http.Request) {
	prices := h.Engine.Prices.AllPrices()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(prices)
}

type priceUpdateRequest struct {
	Symbol string  `json:"symbol"`
	Price  float64 `json:"price"`
}

// Update is an admin-only endpoint. Callers must pass the same secret that is
// set in the ADMIN_SECRET environment variable as a Bearer token.
func (h *PricesHandler) Update(w http.ResponseWriter, r *http.Request) {
	// Simple bearer-token guard
	expected := os.Getenv("ADMIN_SECRET")
	if expected != "" {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer "+expected {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}

	var req priceUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Symbol == "" || req.Price <= 0 {
		http.Error(w, "symbol and price are required", http.StatusBadRequest)
		return
	}

	h.Engine.Prices.SetMarkPrice(req.Symbol, req.Price)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":     true,
		"symbol": req.Symbol,
		"price":  req.Price,
	})
}
