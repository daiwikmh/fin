package main

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"agent-bridge/internal/handler"
	"agent-bridge/internal/matching"
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

	// ── Background context for all long-running goroutines ───────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── Horizon order-book heartbeats (market insight SSE events) ────────────
	watcher.WatchOrderBooks(ctx, s, "MAINNET")
	watcher.WatchOrderBooks(ctx, s, "TESTNET")

	// ── Matching engine ───────────────────────────────────────────────────────
	// settleURL is the endpoint that receives liquidation/settlement requests.
	// It should call AgentVault.settle_pnl with the admin key.
	// Set SETTLE_URL and ADMIN_SECRET in your environment.
	settleURL := os.Getenv("SETTLE_URL")
	if settleURL == "" {
		settleURL = frontendURL + "/api/admin/settle"
	}
	adminSecret := os.Getenv("ADMIN_SECRET")

	eng := matching.NewEngine(settleURL, adminSecret)
	eng.Start(ctx)

	// ── HTTP handlers ─────────────────────────────────────────────────────────
	tokenH := &handler.TokenHandler{Store: s}
	logsH := &handler.LogsHandler{Store: s}
	streamH := &handler.StreamHandler{Store: s}
	skillsH := &handler.SkillsHandler{Store: s}
	proxyH := &handler.ProxyHandler{Store: s, FrontendURL: frontendURL}
	ctxH := &handler.ContextHandler{Store: s}
	ordersH := &handler.OrdersHandler{Engine: eng}
	pricesH := &handler.PricesHandler{Engine: eng}

	mux := http.NewServeMux()

	// Existing routes
	mux.HandleFunc("/api/token/generate", tokenH.Generate)
	mux.HandleFunc("/api/logs", logsH.Post)
	mux.HandleFunc("/api/logs/stream", streamH.Stream)
	mux.HandleFunc("/api/skills", skillsH.List)
	mux.HandleFunc("/api/context", ctxH.Handle)
	mux.HandleFunc("/api/bridge/", proxyH.Handle)

	// Matching engine routes
	mux.HandleFunc("/api/orders", ordersH.Handle)    // GET (book snapshot) + POST (place order)
	mux.HandleFunc("/api/prices", pricesH.Get)        // GET all mark prices
	mux.HandleFunc("/api/price/update", pricesH.Update) // POST — admin / TradingView webhook

	allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "*"
	}
	wrapped := middleware.CORS(mux, allowedOrigin)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}
	fmt.Printf("listening on :%s (frontend=%s, settle=%s)\n", port, frontendURL, settleURL)
	if err := http.ListenAndServe(":"+port, wrapped); err != nil {
		fmt.Printf("server error: %v\n", err)
	}
}
