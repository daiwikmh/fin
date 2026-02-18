package handler

import (
	"encoding/json"
	"net/http"

	"agent-bridge/internal/store"
)

type LogsHandler struct {
	Store *store.Store
}

type logRequest struct {
	Token   string `json:"token"`
	Message string `json:"message"`
	Source  string `json:"source"`
}

func (h *LogsHandler) Post(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req logRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	if !h.Store.ValidateToken(req.Token) {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	entry := store.LogEntry{
		Message: req.Message,
		Source:  req.Source,
	}
	h.Store.Publish(req.Token, entry)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
