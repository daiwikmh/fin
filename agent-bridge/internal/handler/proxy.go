package handler

import (
	"io"
	"net/http"
	"strings"

	"agent-bridge/internal/store"
)

type ProxyHandler struct {
	Store       *store.Store
	FrontendURL string // e.g. http://localhost:3000
}

func (h *ProxyHandler) Handle(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("X-Agent-Token")
	if token == "" || !h.Store.ValidateToken(token) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Network detection: prefer the explicit X-Stellar-Network header sent
	// by the agent; fall back to whatever the token's context already stores.
	if network := r.Header.Get("X-Stellar-Network"); network == "MAINNET" || network == "TESTNET" {
		h.Store.SetActiveView(token, "", network)
	}

	// Strip /api/bridge prefix and proxy to /api/agent on the frontend.
	path := strings.TrimPrefix(r.URL.Path, "/api/bridge")

	// On agent's first request, notify the frontend via SSE.
	if h.Store.MarkAgentConnected(token) {
		h.Store.Publish(token, store.LogEntry{
			Message: "Agent connected and ready",
			Source:  "system",
		})
	}

	// Log every agent request to the frontend terminal.
	h.Store.Publish(token, store.LogEntry{
		Message: r.Method + " " + path,
		Source:  "agent",
	})

	target := h.FrontendURL + "/api/agent" + path
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}

	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		http.Error(w, "failed to create proxy request", http.StatusInternalServerError)
		return
	}
	proxyReq.Header = r.Header.Clone()
	proxyReq.Header.Del("X-Agent-Token")
	// Forward detected network to the frontend for informational use.
	if snap := h.Store.GetContextSnapshot(token); snap != nil && snap.Network != "" {
		proxyReq.Header.Set("X-Stellar-Network", snap.Network)
	}

	resp, err := http.DefaultClient.Do(proxyReq)
	if err != nil {
		http.Error(w, "proxy request failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
