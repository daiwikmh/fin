package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"agent-bridge/internal/store"
)

type StreamHandler struct {
	Store *store.Store
}

func (h *StreamHandler) Stream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := r.URL.Query().Get("token")
	if token == "" || !h.Store.ValidateToken(token) {
		http.Error(w, "invalid token", http.StatusNotFound)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := h.Store.Subscribe(token)
	if ch == nil {
		http.Error(w, "invalid token", http.StatusNotFound)
		return
	}
	defer h.Store.Unsubscribe(token, ch)

	// Send connected event.
	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"connected\"}\n\n")
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case entry, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(entry)
			if err != nil {
				continue
			}

			// Named SSE events for insight and context_update so the frontend
			// can add dedicated addEventListener() handlers. Regular logs use
			// the default "message" event (caught by onmessage).
			switch entry.EventType {
			case "insight", "context_update":
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", entry.EventType, data)
			default:
				fmt.Fprintf(w, "data: %s\n\n", data)
			}
			flusher.Flush()
		}
	}
}
