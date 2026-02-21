package watcher

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"agent-bridge/internal/store"
)

const (
	mainnetHorizon = "https://horizon.stellar.org"
	testnetHorizon = "https://horizon-testnet.stellar.org"
)

// HorizonURL returns the Horizon base URL for the given network.
func HorizonURL(network string) string {
	if network == "MAINNET" {
		return mainnetHorizon
	}
	return testnetHorizon
}

// WatchAccount launches a background goroutine that streams new transactions
// for the given Stellar account via Horizon SSE and publishes context_update
// events to the SSE log stream. The goroutine stops when ctx is cancelled.
func WatchAccount(ctx context.Context, s *store.Store, token, accountID, network string) {
	go func() {
		base := HorizonURL(network)
		url := fmt.Sprintf("%s/accounts/%s/transactions?cursor=now&limit=5", base, accountID)

		shortID := accountID
		if len(shortID) > 8 {
			shortID = shortID[:8]
		}

		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			err := streamSSE(ctx, url, func(data string) {
				if data == "" || data == `"hello"` {
					return
				}
				txID := extractJSONString(data, "id")
				createdAt := extractJSONString(data, "created_at")
				if createdAt == "" {
					createdAt = time.Now().UTC().Format(time.RFC3339)
				}

				preview := txID
				if len(preview) > 12 {
					preview = preview[:12]
				}

				s.AddRecentTrade(token, store.TradeRecord{
					ID:        txID,
					Type:      "transaction",
					CreatedAt: createdAt,
				})
				s.Publish(token, store.LogEntry{
					Message:   fmt.Sprintf("New transaction on %s: %s…", network, preview),
					Source:    "system",
					EventType: "context_update",
				})
			})

			if err != nil && ctx.Err() == nil {
				log.Printf("[account-watcher] %s SSE error: %v — retry in 5s", shortID, err)
				select {
				case <-ctx.Done():
					return
				case <-time.After(5 * time.Second):
				}
			}
		}
	}()
}

// streamSSE opens a Horizon SSE endpoint and calls onData for each data line.
// Returns when the stream ends or ctx is cancelled.
func streamSSE(ctx context.Context, url string, onData func(string)) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	scanner := bufio.NewScanner(resp.Body)
	buf := make([]byte, 512*1024)
	scanner.Buffer(buf, cap(buf))

	for scanner.Scan() {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			onData(strings.TrimPrefix(line, "data: "))
		}
	}
	return scanner.Err()
}

// extractJSONString pulls the string value for a given key from raw JSON,
// avoiding the need to fully unmarshal large transaction payloads.
func extractJSONString(js, key string) string {
	needle := `"` + key + `":"`
	idx := strings.Index(js, needle)
	if idx < 0 {
		return ""
	}
	rest := js[idx+len(needle):]
	end := strings.Index(rest, `"`)
	if end < 0 {
		return rest
	}
	return rest[:end]
}
