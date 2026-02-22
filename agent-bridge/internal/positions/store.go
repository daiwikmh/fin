// Package positions tracks open leveraged SDEX positions in memory,
// with write-through persistence to SQLite so positions survive bridge restarts.
package positions

import (
	"log"
	"sync"

	"agent-bridge/internal/db"
)

// Side is "long" or "short".
type Side string

const (
	Long  Side = "long"
	Short Side = "short"
)

// Position represents a single open leveraged position.
//
//   - Long:  admin holds XLMAmount XLM on-chain (bought from SDEX).
//   - Short: synthetic only — no SDEX execution; P&L settled on close.
type Position struct {
	UserToken      string  `json:"userToken"`
	UserAddr       string  `json:"userAddr"`
	Symbol         string  `json:"symbol"`
	Side           Side    `json:"side"`
	EntryPrice     float64 `json:"entryPrice"`
	XLMAmount      float64 `json:"xlmAmount"`
	TotalUSDC      float64 `json:"totalUSDC"`
	CollateralUSDC float64 `json:"collateralUSDC"`
	Leverage       int     `json:"leverage"`
	OpenTxHash     string  `json:"openTxHash,omitempty"`
}

// PnL computes the unrealised PnL in USDC at the given mark price.
//   - Long:  (markPrice - entryPrice) / entryPrice * totalUSDC
//   - Short: (entryPrice - markPrice) / entryPrice * totalUSDC
func (p *Position) PnL(markPrice float64) float64 {
	if p.EntryPrice == 0 {
		return 0
	}
	pct := (markPrice - p.EntryPrice) / p.EntryPrice
	if p.Side == Short {
		pct = -pct
	}
	return pct * p.TotalUSDC
}

// Store is a thread-safe in-memory position registry with SQLite write-through.
type Store struct {
	mu        sync.RWMutex
	positions map[string]*Position // userToken → position
	db        *db.DB               // nil when running without persistence
}

// New creates a Store. If database is non-nil, positions are persisted to SQLite
// and existing rows are loaded into memory immediately.
func New(database *db.DB) *Store {
	s := &Store{
		positions: make(map[string]*Position),
		db:        database,
	}
	if database != nil {
		s.loadFromDB()
	}
	return s
}

// loadFromDB re-hydrates all persisted positions into memory on startup.
func (s *Store) loadFromDB() {
	rows, err := s.db.AllPositions()
	if err != nil {
		log.Printf("[positions] load from db: %v", err)
		return
	}
	for _, r := range rows {
		s.positions[r.Token] = &Position{
			UserToken:      r.Token,
			UserAddr:       r.UserAddr,
			Symbol:         r.Symbol,
			Side:           Side(r.Side),
			EntryPrice:     r.EntryPrice,
			XLMAmount:      r.XLMAmount,
			TotalUSDC:      r.TotalUSDC,
			CollateralUSDC: r.CollateralUSDC,
			Leverage:       r.Leverage,
		}
	}
	log.Printf("[positions] restored %d position(s) from db", len(rows))
}

// Add stores a new position (overwrites any existing position for the token).
func (s *Store) Add(p *Position) {
	s.mu.Lock()
	s.positions[p.UserToken] = p
	s.mu.Unlock()
	if s.db != nil {
		err := s.db.UpsertPosition(db.PositionRow{
			Token:          p.UserToken,
			UserAddr:       p.UserAddr,
			Symbol:         p.Symbol,
			Side:           string(p.Side),
			EntryPrice:     p.EntryPrice,
			XLMAmount:      p.XLMAmount,
			TotalUSDC:      p.TotalUSDC,
			CollateralUSDC: p.CollateralUSDC,
			Leverage:       p.Leverage,
		})
		if err != nil {
			log.Printf("[positions] persist %s: %v", p.UserToken, err)
		}
	}
}

// Get returns the position for a token, or nil.
func (s *Store) Get(userToken string) *Position {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p := s.positions[userToken]
	if p == nil {
		return nil
	}
	cp := *p
	return &cp
}

// Remove deletes the position for a token.
func (s *Store) Remove(userToken string) {
	s.mu.Lock()
	delete(s.positions, userToken)
	s.mu.Unlock()
	if s.db != nil {
		if err := s.db.DeletePosition(userToken); err != nil {
			log.Printf("[positions] delete %s: %v", userToken, err)
		}
	}
}

// All returns a snapshot of all open positions.
func (s *Store) All() []*Position {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Position, 0, len(s.positions))
	for _, p := range s.positions {
		cp := *p
		out = append(out, &cp)
	}
	return out
}
