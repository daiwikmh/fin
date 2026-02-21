package watcher

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"time"

	"agent-bridge/internal/store"
)

// assetPair describes one side of an order book query.
type assetPair struct {
	sellingType  string
	buyingType   string
	buyingCode   string
	buyingIssuer string
	label        string
}

// monitoredPairs defines which order books to watch per network.
var monitoredPairs = map[string][]assetPair{
	"TESTNET": {
		{
			sellingType:  "native",
			buyingType:   "credit_alphanum4",
			buyingCode:   "USDC",
			buyingIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
			label:        "XLM/USDC",
		},
	},
	"MAINNET": {
		{
			sellingType:  "native",
			buyingType:   "credit_alphanum4",
			buyingCode:   "USDC",
			buyingIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
			label:        "XLM/USDC",
		},
		{
			sellingType:  "native",
			buyingType:   "credit_alphanum4",
			buyingCode:   "EURC",
			buyingIssuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP",
			label:        "XLM/EURC",
		},
	},
}

type obLevel struct {
	Price  string `json:"price"`
	Amount string `json:"amount"`
}

type horizonOrderBook struct {
	Bids []obLevel `json:"bids"`
	Asks []obLevel `json:"asks"`
}

// pairState holds the last-known mid-price and top-of-book sizes for one pair.
type pairState struct {
	mid    float64
	topBid float64
	topAsk float64
}

// WatchOrderBooks polls both order books for the given network every 10 seconds
// and publishes insight events to all connected tokens when:
//   - the mid-price moves more than 0.5%
//   - a top-of-book wall shrinks by more than 50%
//
// The goroutine stops when ctx is cancelled.
func WatchOrderBooks(ctx context.Context, s *store.Store, network string) {
	pairs := monitoredPairs[network]
	if len(pairs) == 0 {
		return
	}

	go func() {
		states := make(map[string]*pairState, len(pairs))
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				for _, pair := range pairs {
					pollPair(ctx, s, network, pair, states)
				}
			}
		}
	}()
}

func pollPair(ctx context.Context, s *store.Store, network string, pair assetPair, states map[string]*pairState) {
	base := HorizonURL(network)
	url := fmt.Sprintf(
		"%s/order_book?selling_asset_type=%s&buying_asset_type=%s&buying_asset_code=%s&buying_asset_issuer=%s&limit=10",
		base, pair.sellingType, pair.buyingType, pair.buyingCode, pair.buyingIssuer,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	var ob horizonOrderBook
	if err := json.NewDecoder(resp.Body).Decode(&ob); err != nil {
		return
	}
	if len(ob.Asks) == 0 || len(ob.Bids) == 0 {
		return
	}

	askF, err1 := strconv.ParseFloat(ob.Asks[0].Price, 64)
	bidF, err2 := strconv.ParseFloat(ob.Bids[0].Price, 64)
	if err1 != nil || err2 != nil {
		return
	}
	mid := (askF + bidF) / 2.0

	topBidAmt, _ := strconv.ParseFloat(ob.Bids[0].Amount, 64)
	topAskAmt, _ := strconv.ParseFloat(ob.Asks[0].Amount, 64)

	key := pair.label
	prev, seen := states[key]
	if !seen {
		states[key] = &pairState{mid: mid, topBid: topBidAmt, topAsk: topAskAmt}
		return
	}

	// Price-move insight: fire if mid moves ≥ 0.5%.
	if prev.mid > 0 {
		pct := math.Abs((mid-prev.mid)/prev.mid) * 100
		if pct >= 0.5 {
			msg := fmt.Sprintf(
				"[Insight] %s %s price moved %.2f%% → %.6f (was %.6f)",
				network, pair.label, pct, mid, prev.mid,
			)
			log.Println(msg)
			s.PublishAll(store.LogEntry{
				Message:   msg,
				Source:    "insight",
				EventType: "insight",
			})
		}
	}

	// Wall-removal insight: fire if top-of-book size drops ≥ 50%.
	if prev.topBid > 0 && topBidAmt < prev.topBid*0.5 {
		msg := fmt.Sprintf(
			"[Insight] %s %s large bid wall removed (%.0f → %.0f XLM)",
			network, pair.label, prev.topBid, topBidAmt,
		)
		log.Println(msg)
		s.PublishAll(store.LogEntry{
			Message:   msg,
			Source:    "insight",
			EventType: "insight",
		})
	}
	if prev.topAsk > 0 && topAskAmt < prev.topAsk*0.5 {
		msg := fmt.Sprintf(
			"[Insight] %s %s large ask wall removed (%.0f → %.0f XLM)",
			network, pair.label, prev.topAsk, topAskAmt,
		)
		log.Println(msg)
		s.PublishAll(store.LogEntry{
			Message:   msg,
			Source:    "insight",
			EventType: "insight",
		})
	}

	states[key] = &pairState{mid: mid, topBid: topBidAmt, topAsk: topAskAmt}
}
