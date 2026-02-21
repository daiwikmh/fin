package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"agent-bridge/internal/store"
	"agent-bridge/internal/watcher"
)

// ContextHandler handles the /api/context endpoint for syncing UI state
// and registering account watchers.
type ContextHandler struct {
	Store *store.Store
}

type contextUpdateRequest struct {
	Token      string `json:"token"`
	AccountID  string `json:"account_id"`
	Network    string `json:"network"`    // "MAINNET" | "TESTNET"
	ActivePair string `json:"active_pair"`
}

func (h *ContextHandler) Handle(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		h.update(w, r)
	case http.MethodGet:
		h.get(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// POST /api/context — update active pair, network, and optionally start account watcher.
func (h *ContextHandler) update(w http.ResponseWriter, r *http.Request) {
	var req contextUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if !h.Store.ValidateToken(req.Token) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Always update the stored view (pair / network).
	h.Store.SetActiveView(req.Token, req.ActivePair, req.Network)

	// If an account ID is provided, (re)start the account watcher goroutine.
	if req.AccountID != "" {
		network := req.Network
		if network != "MAINNET" && network != "TESTNET" {
			network = "TESTNET"
		}
		watchCtx, cancel := context.WithCancel(context.Background())
		h.Store.SetAccountWatch(req.Token, req.AccountID, network, cancel)
		watcher.WatchAccount(watchCtx, h.Store, req.Token, req.AccountID, network)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// GET /api/context?token=... — return the live context snapshot for a token.
// The agent can call this directly (no /bridge/ proxy needed) to know
// what the user is currently looking at in the terminal.
func (h *ContextHandler) get(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		token = r.Header.Get("X-Agent-Token")
	}
	if !h.Store.ValidateToken(token) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	snap := h.Store.GetContextSnapshot(token)
	if snap == nil {
		http.Error(w, "context not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snap)
}
