package handler

import (
	"encoding/json"
	"net/http"

	"agent-bridge/internal/store"
)

type Skill struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Method      string            `json:"method"`
	Path        string            `json:"path"`
	Params      map[string]string `json:"params,omitempty"`
}

type SkillsHandler struct {
	Store *store.Store
}

func (h *SkillsHandler) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := r.Header.Get("X-Agent-Token")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" || !h.Store.ValidateToken(token) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	skills := []Skill{
		{
			Name:        "orderbook",
			Description: "Get live SDEX order book for a trading pair",
			Method:      "GET",
			Path:        "/api/bridge/orderbook",
			Params:      map[string]string{"symbol": "Trading pair symbol, e.g. XLM/USDC"},
		},
		{
			Name:        "pairs",
			Description: "List available trading pairs and assets for the current network",
			Method:      "GET",
			Path:        "/api/bridge/pairs",
		},
		{
			Name:        "offers",
			Description: "Get open DEX offers for an account",
			Method:      "GET",
			Path:        "/api/bridge/offers",
			Params:      map[string]string{"account": "Stellar account ID (G...)"},
		},
		{
			Name:        "trades",
			Description: "Get recent trade history for an account",
			Method:      "GET",
			Path:        "/api/bridge/trades",
			Params:      map[string]string{"account": "Stellar account ID (G...)", "limit": "Number of trades to return (default 20)"},
		},
		{
			Name:        "trustline",
			Description: "Check trustline status for an asset on an account",
			Method:      "GET",
			Path:        "/api/bridge/trustline",
			Params:      map[string]string{"account": "Stellar account ID (G...)", "asset": "Asset code, e.g. USDC"},
		},
		{
			Name:        "price",
			Description: "Get current mid-price for a trading pair",
			Method:      "GET",
			Path:        "/api/bridge/price",
			Params:      map[string]string{"symbol": "Trading pair symbol, e.g. XLM/USDC"},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"skills": skills})
}
