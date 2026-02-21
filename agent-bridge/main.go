package main

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"agent-bridge/internal/handler"
	"agent-bridge/internal/middleware"
	"agent-bridge/internal/store"
	"agent-bridge/internal/watcher"
)

func main() {
	s := store.NewStore()

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	// Start global order book heartbeats for both networks.
	// These broadcast insight events to all connected tokens.
	watchCtx, cancelWatchers := context.WithCancel(context.Background())
	defer cancelWatchers()
	watcher.WatchOrderBooks(watchCtx, s, "MAINNET")
	watcher.WatchOrderBooks(watchCtx, s, "TESTNET")

	tokenH := &handler.TokenHandler{Store: s}
	logsH := &handler.LogsHandler{Store: s}
	streamH := &handler.StreamHandler{Store: s}
	skillsH := &handler.SkillsHandler{Store: s}
	proxyH := &handler.ProxyHandler{Store: s, FrontendURL: frontendURL}
	ctxH := &handler.ContextHandler{Store: s}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/token/generate", tokenH.Generate)
	mux.HandleFunc("/api/logs", logsH.Post)
	mux.HandleFunc("/api/logs/stream", streamH.Stream)
	mux.HandleFunc("/api/skills", skillsH.List)
	mux.HandleFunc("/api/context", ctxH.Handle)
	mux.HandleFunc("/api/bridge/", proxyH.Handle)

	allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "*"
	}
	wrapped := middleware.CORS(mux, allowedOrigin)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}
	fmt.Printf("listening on :%s (frontend=%s)\n", port, frontendURL)
	if err := http.ListenAndServe(":"+port, wrapped); err != nil {
		fmt.Printf("server error: %v\n", err)
	}
}
