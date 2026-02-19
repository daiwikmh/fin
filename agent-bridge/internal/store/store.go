package store

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

type LogEntry struct {
	Token     string `json:"token,omitempty"`
	Message   string `json:"message"`
	Source    string `json:"source"`
	Timestamp string `json:"timestamp"`
}

type Connection struct {
	Token          string
	CreatedAt      time.Time
	AgentConnected bool
	subscribers    map[chan LogEntry]bool
	mu             sync.RWMutex
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
		subscribers: make(map[chan LogEntry]bool),
	}
	return token, nil
}

func (s *Store) ValidateToken(token string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.connections[token]
	return ok
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
