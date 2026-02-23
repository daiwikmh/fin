package handler

import (
	"encoding/json"
	"net/http"
	"os"

	"agent-bridge/internal/soroban"
)

// AdminHandler exposes admin-only contract-controller endpoints.
// Every request must carry the correct Bearer token (ADMIN_SECRET env var).
//
//	POST /api/admin/settle          — call AgentVault.settle_pnl
//	POST /api/admin/position        — call LeveragePool.open_synthetic_position
//	POST /api/admin/position/close  — call LeveragePool.close_position
type AdminHandler struct {
	Soroban *soroban.Client
}

// ── Settle PnL ───────────────────────────────────────────────────────────────

type settleRequest struct {
	// UserAddr is the G... Stellar address of the trader.
	UserAddr string `json:"userAddr"`
	// PnL is the raw profit/loss in the token's native unit (e.g. USDC).
	// The handler scales it by soroban.ScaleFactor before calling the contract.
	// Positive = profit credited to user; negative = loss seized.
	PnL float64 `json:"pnl"`
	// TokenAddr is the C... contract address of the settlement token.
	TokenAddr string `json:"tokenAddr"`
}

func (h *AdminHandler) Settle(w http.ResponseWriter, r *http.Request) {
	if !h.authed(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req settleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserAddr == "" || req.TokenAddr == "" {
		http.Error(w, "userAddr, pnl, tokenAddr are required", http.StatusBadRequest)
		return
	}

	// Scale the float PnL to 7-decimal int64.
	pnlScaled := int64(req.PnL * float64(soroban.ScaleFactor))

	if err := h.Soroban.SettleTrade(r.Context(), req.UserAddr, pnlScaled, req.TokenAddr); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
}

// ── Open Synthetic Position ───────────────────────────────────────────────────

type openPositionRequest struct {
	User             string  `json:"user"`             // G... address
	AssetSymbol      string  `json:"assetSymbol"`      // e.g. "XLM"
	XlmAmount        float64 `json:"xlmAmount"`        // position size in base-asset units
	EntryPrice       float64 `json:"entryPrice"`       // entry price in USDC per token
	IsLong           bool    `json:"isLong"`           // true = long, false = short
	CollateralToken  string  `json:"collateralToken"`  // C... address
	CollateralLocked float64 `json:"collateralLocked"` // collateral to lock (scaled internally)
}

func (h *AdminHandler) OpenPosition(w http.ResponseWriter, r *http.Request) {
	if !h.authed(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req openPositionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		req.User == "" || req.AssetSymbol == "" || req.CollateralToken == "" {
		http.Error(w, "user, assetSymbol, debtAmount, collateralToken, collateralLocked are required",
			http.StatusBadRequest)
		return
	}

	xlmScaled := int64(req.XlmAmount * float64(soroban.ScaleFactor))
	entryScaled := int64(req.EntryPrice * float64(soroban.ScaleFactor))
	collScaled := int64(req.CollateralLocked * float64(soroban.ScaleFactor))

	if err := h.Soroban.OpenPosition(
		r.Context(),
		req.User, req.AssetSymbol,
		xlmScaled, entryScaled, req.IsLong,
		req.CollateralToken,
		collScaled,
	); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
}

// ── Close Position ────────────────────────────────────────────────────────────

type closePositionRequest struct {
	User            string  `json:"user"`            // G... address
	CollateralToken string  `json:"collateralToken"` // C... address
	ClosePrice      float64 `json:"closePrice"`      // current mark price (human units)
}

func (h *AdminHandler) ClosePosition(w http.ResponseWriter, r *http.Request) {
	if !h.authed(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req closePositionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.User == "" || req.CollateralToken == "" {
		http.Error(w, "user and collateralToken are required", http.StatusBadRequest)
		return
	}

	if err := h.Soroban.ClosePosition(r.Context(), req.User, req.CollateralToken, req.ClosePrice); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
}

// ── auth helper ───────────────────────────────────────────────────────────────

func (h *AdminHandler) authed(r *http.Request) bool {
	secret := os.Getenv("ADMIN_SECRET")
	if secret == "" {
		return true // no secret set — development mode only
	}
	return r.Header.Get("Authorization") == "Bearer "+secret
}
