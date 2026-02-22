// Package db provides a thin SQLite wrapper for persisting session tokens
// and open leveraged positions across bridge restarts.
package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

// DB wraps a SQLite connection pool.
type DB struct {
	sql *sql.DB
}

// Open opens (or creates) the SQLite file at path and runs migrations.
func Open(path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("db: open %q: %w", path, err)
	}
	conn.SetMaxOpenConns(1) // SQLite is single-writer
	d := &DB{sql: conn}
	if err = d.migrate(); err != nil {
		conn.Close()
		return nil, err
	}
	log.Printf("[db] opened %s", path)
	return d, nil
}

// Close closes the underlying connection.
func (d *DB) Close() error { return d.sql.Close() }

func (d *DB) migrate() error {
	_, err := d.sql.Exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			token       TEXT PRIMARY KEY,
			account_id  TEXT NOT NULL DEFAULT '',
			network     TEXT NOT NULL DEFAULT 'TESTNET',
			active_pair TEXT NOT NULL DEFAULT 'XLM/USDC',
			created_at  INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS positions (
			token           TEXT PRIMARY KEY,
			user_addr       TEXT NOT NULL,
			symbol          TEXT NOT NULL,
			side            TEXT NOT NULL,
			entry_price     REAL NOT NULL,
			xlm_amount      REAL NOT NULL,
			total_usdc      REAL NOT NULL,
			collateral_usdc REAL NOT NULL,
			leverage        INTEGER NOT NULL,
			opened_at       INTEGER NOT NULL
		);
	`)
	return err
}

// ── Session CRUD ──────────────────────────────────────────────────────────────

// Session mirrors the columns in the sessions table.
type Session struct {
	Token      string
	AccountID  string
	Network    string
	ActivePair string
	CreatedAt  time.Time
}

// InsertSession creates a new session row.
func (d *DB) InsertSession(token string) error {
	_, err := d.sql.Exec(
		`INSERT OR IGNORE INTO sessions (token, created_at) VALUES (?, ?)`,
		token, time.Now().Unix(),
	)
	return err
}

// UpdateSessionAccount stores the Stellar address and network for a token.
func (d *DB) UpdateSessionAccount(token, accountID, network string) error {
	_, err := d.sql.Exec(
		`UPDATE sessions SET account_id=?, network=? WHERE token=?`,
		accountID, network, token,
	)
	return err
}

// UpdateSessionPair stores the active trading pair for a token.
func (d *DB) UpdateSessionPair(token, pair, network string) error {
	_, err := d.sql.Exec(
		`UPDATE sessions SET active_pair=?, network=? WHERE token=?`,
		pair, network, token,
	)
	return err
}

// AllSessions returns all persisted sessions.
func (d *DB) AllSessions() ([]Session, error) {
	rows, err := d.sql.Query(
		`SELECT token, account_id, network, active_pair, created_at FROM sessions`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Session
	for rows.Next() {
		var s Session
		var ts int64
		if err = rows.Scan(&s.Token, &s.AccountID, &s.Network, &s.ActivePair, &ts); err != nil {
			return nil, err
		}
		s.CreatedAt = time.Unix(ts, 0)
		out = append(out, s)
	}
	return out, rows.Err()
}

// ── Position CRUD ─────────────────────────────────────────────────────────────

// PositionRow mirrors the columns in the positions table.
type PositionRow struct {
	Token          string
	UserAddr       string
	Symbol         string
	Side           string
	EntryPrice     float64
	XLMAmount      float64
	TotalUSDC      float64
	CollateralUSDC float64
	Leverage       int
	OpenedAt       time.Time
}

// UpsertPosition inserts or replaces a position row.
func (d *DB) UpsertPosition(p PositionRow) error {
	_, err := d.sql.Exec(`
		INSERT OR REPLACE INTO positions
			(token, user_addr, symbol, side, entry_price, xlm_amount,
			 total_usdc, collateral_usdc, leverage, opened_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.Token, p.UserAddr, p.Symbol, p.Side,
		p.EntryPrice, p.XLMAmount, p.TotalUSDC, p.CollateralUSDC,
		p.Leverage, time.Now().Unix(),
	)
	return err
}

// DeletePosition removes a position row by token.
func (d *DB) DeletePosition(token string) error {
	_, err := d.sql.Exec(`DELETE FROM positions WHERE token=?`, token)
	return err
}

// AllPositions returns all persisted positions.
func (d *DB) AllPositions() ([]PositionRow, error) {
	rows, err := d.sql.Query(`
		SELECT token, user_addr, symbol, side, entry_price, xlm_amount,
		       total_usdc, collateral_usdc, leverage, opened_at
		FROM positions`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PositionRow
	for rows.Next() {
		var p PositionRow
		var ts int64
		if err = rows.Scan(
			&p.Token, &p.UserAddr, &p.Symbol, &p.Side,
			&p.EntryPrice, &p.XLMAmount, &p.TotalUSDC, &p.CollateralUSDC,
			&p.Leverage, &ts,
		); err != nil {
			return nil, err
		}
		p.OpenedAt = time.Unix(ts, 0)
		out = append(out, p)
	}
	return out, rows.Err()
}
