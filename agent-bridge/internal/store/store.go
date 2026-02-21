package store

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// LogEntry is what gets streamed to SSE subscribers.
// EventType: "log" (default), "insight" (market signal), "context_update" (account activity).
type LogEntry struct {
	Token     string `json:"token,omitempty"`
	Message   string `json:"message"`
	Source    string `json:"source"`
	Timestamp string `json:"timestamp"`
	EventType string `json:"event_type,omitempty"`
}

type TradeRecord struct {
	ID           string `json:"id"`
	Type         string `json:"type"`
	BaseAsset    string `json:"base_asset"`
	CounterAsset string `json:"counter_asset"`
	Price        string `json:"price"`
	Amount       string `json:"amount"`
	CreatedAt    string `json:"created_at"`
}

type OfferRecord struct {
	ID      string `json:"id"`
	Selling string `json:"selling"`
	Buying  string `json:"buying"`
	Amount  string `json:"amount"`
	Price   string `json:"price"`
}

// UserContext tracks the live state for a connected user.
// Protected by the parent Connection's mu — no separate mutex.
type UserContext struct {
	LastActiveNetwork string        `json:"last_active_network"`
	RecentTrades      []TradeRecord `json:"recent_trades"`
	OpenOffers        []OfferRecord `json:"open_offers"`
	ActivePair        string        `json:"active_pair"`
}

// ContextSnapshot is a thread-safe copy returned to callers outside the store.
type ContextSnapshot struct {
	Network           string        `json:"network"`
	AccountID         string        `json:"account_id"`
	ActivePair        string        `json:"active_pair"`
	LastActiveNetwork string        `json:"last_active_network"`
	RecentTrades      []TradeRecord `json:"recent_trades"`
	OpenOffers        []OfferRecord `json:"open_offers"`
}

type Connection struct {
	Token          string
	CreatedAt      time.Time
	AgentConnected bool
	subscribers    map[chan LogEntry]bool
	mu             sync.RWMutex

	// Real-time observer fields — set when the user pairs their Stellar account.
	AccountID   string
	Network     string       // "MAINNET" | "TESTNET"
	Context     *UserContext
	WatchCancel func()       // cancel func for the account-watching goroutine
}

type Store struct {
	mu          sync.RWMutex
	connections map[string]*Connection
}

func NewStore() *Store {
	return &Store{
		connections: make(map[string]*Connection),
	}
}

func (s *Store) CreateToken() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)

	s.mu.Lock()
	defer s.mu.Unlock()

	s.connections[token] = &Connection{
		Token:       token,
		CreatedAt:   time.Now(),
		Network:     "TESTNET",
		subscribers: make(map[chan LogEntry]bool),
		Context: &UserContext{
			LastActiveNetwork: "TESTNET",
			ActivePair:        "XLM/USDC",
		},
	}
	return token, nil
}

func (s *Store) ValidateToken(token string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.connections[token]
	return ok
}

func (s *Store) GetConnection(token string) *Connection {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.connections[token]
}

func (s *Store) Subscribe(token string) chan LogEntry {
	s.mu.RLock()
	conn, ok := s.connections[token]
	s.mu.RUnlock()
	if !ok {
		return nil
	}
	ch := make(chan LogEntry, 64)
	conn.mu.Lock()
	conn.subscribers[ch] = true
	conn.mu.Unlock()
	return ch
}

func (s *Store) Unsubscribe(token string, ch chan LogEntry) {
	s.mu.RLock()
	conn, ok := s.connections[token]
	s.mu.RUnlock()
	if !ok {
		return
	}
	conn.mu.Lock()
	delete(conn.subscribers, ch)
	conn.mu.Unlock()
	close(ch)
}

// MarkAgentConnected returns true on the first call per token (agent's first request).
func (s *Store) MarkAgentConnected(token string) bool {
	s.mu.RLock()
	conn, ok := s.connections[token]
	s.mu.RUnlock()
	if !ok {
		return false
	}
	conn.mu.Lock()
	defer conn.mu.Unlock()
	if conn.AgentConnected {
		return false
	}
	conn.AgentConnected = true
	return true
}

func (s *Store) IsAgentConnected(token string) bool {
	s.mu.RLock()
	conn, ok := s.connections[token]
	s.mu.RUnlock()
	if !ok {
		return false
	}
	conn.mu.RLock()
	defer conn.mu.RUnlock()
	return conn.AgentConnected
}

func (s *Store) Publish(token string, entry LogEntry) bool {
	s.mu.RLock()
	conn, ok := s.connections[token]
	s.mu.RUnlock()
	if !ok {
		return false
	}
	entry.Timestamp = time.Now().UTC().Format(time.RFC3339)
	conn.mu.RLock()
	defer conn.mu.RUnlock()
	for ch := range conn.subscribers {
		select {
		case ch <- entry:
		default:
			// drop if subscriber is slow
		}
	}
	return true
}

// PublishAll broadcasts a log entry to every connected token.
// Used for global market insights from the order book heartbeat.
func (s *Store) PublishAll(entry LogEntry) {
	s.mu.RLock()
	tokens := make([]string, 0, len(s.connections))
	for t := range s.connections {
		tokens = append(tokens, t)
	}
	s.mu.RUnlock()

	for _, t := range tokens {
		s.Publish(t, entry)
	}
}

// SetAccountWatch registers an account ID and network for a token,
// cancels any previous account-watcher goroutine, and stores the new cancel func.
func (s *Store) SetAccountWatch(token, accountID, network string, cancel func()) {
	s.mu.RLock()
	conn, ok := s.connections[token]
	s.mu.RUnlock()
	if !ok {
		return
	}
	conn.mu.Lock()
	if conn.WatchCancel != nil {
		conn.WatchCancel()
	}
	conn.AccountID = accountID
	conn.Network = network
	conn.WatchCancel = cancel
	if conn.Context != nil {
		conn.Context.LastActiveNetwork = network
	}
	conn.mu.Unlock()
}

// SetActiveView updates the active pair and/or network for a token.
func (s *Store) SetActiveView(token, pair, network string) {
	s.mu.RLock()
	conn, ok := s.connections[token]
	s.mu.RUnlock()
	if !ok {
		return
	}
	conn.mu.Lock()
	if conn.Context != nil {
		if pair != "" {
			conn.Context.ActivePair = pair
		}
		if network != "" {
			conn.Context.LastActiveNetwork = network
			conn.Network = network
		}
	}
	conn.mu.Unlock()
}

// AddRecentTrade prepends a trade to the context (capped at 5).
func (s *Store) AddRecentTrade(token string, trade TradeRecord) {
	s.mu.RLock()
	conn, ok := s.connections[token]
	s.mu.RUnlock()
	if !ok || conn.Context == nil {
		return
	}
	conn.mu.Lock()
	conn.Context.RecentTrades = append([]TradeRecord{trade}, conn.Context.RecentTrades...)
	if len(conn.Context.RecentTrades) > 5 {
		conn.Context.RecentTrades = conn.Context.RecentTrades[:5]
	}
	conn.mu.Unlock()
}

// SetOpenOffers replaces the open offers snapshot.
func (s *Store) SetOpenOffers(token string, offers []OfferRecord) {
	s.mu.RLock()
	conn, ok := s.connections[token]
	s.mu.RUnlock()
	if !ok || conn.Context == nil {
		return
	}
	conn.mu.Lock()
	conn.Context.OpenOffers = offers
	conn.mu.Unlock()
}

// GetContextSnapshot returns a thread-safe copy of the full context for a token.
func (s *Store) GetContextSnapshot(token string) *ContextSnapshot {
	s.mu.RLock()
	conn, ok := s.connections[token]
	s.mu.RUnlock()
	if !ok {
		return nil
	}
	conn.mu.RLock()
	defer conn.mu.RUnlock()

	snap := &ContextSnapshot{
		Network:   conn.Network,
		AccountID: conn.AccountID,
	}
	if conn.Context != nil {
		snap.ActivePair = conn.Context.ActivePair
		snap.LastActiveNetwork = conn.Context.LastActiveNetwork
		snap.RecentTrades = append([]TradeRecord{}, conn.Context.RecentTrades...)
		snap.OpenOffers = append([]OfferRecord{}, conn.Context.OpenOffers...)
	}
	return snap
}
