// Package sdex executes leveraged trades on the Stellar DEX (SDEX) using the
// admin's Stellar account.  It uses Horizon's PathPaymentStrictSend operation
// to swap between XLM (native) and USDC.
//
// Long  (buy XLM):  admin sends USDC → receives XLM on SDEX
// Short (synthetic): no SDEX execution; position is tracked notionally and
//
//	settled via price-oracle PnL when closed.
package sdex

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/txnbuild"
)

const (
	// USDCIssuerTestnet is the classic Stellar USDC issuer on testnet.
	USDCIssuerTestnet = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
	// slippage tolerance for PathPaymentStrictSend (1%).
	slippage = 0.99
)

// Client executes SDEX trades on behalf of the admin account.
type Client struct {
	HorizonURL        string
	NetworkPassphrase string
	AdminSecret       string
	USDCIssuer        string // classic Stellar G... USDC issuer
	http              *http.Client
}

// New creates a ready-to-use SDEX client.
func New(horizonURL, networkPassphrase, adminSecret, usdcIssuer string) *Client {
	if usdcIssuer == "" {
		usdcIssuer = USDCIssuerTestnet
	}
	// Strip trailing slash so URL construction is consistent.
	horizonURL = strings.TrimRight(horizonURL, "/")
	return &Client{
		HorizonURL:        horizonURL,
		NetworkPassphrase: networkPassphrase,
		AdminSecret:       adminSecret,
		USDCIssuer:        usdcIssuer,
		http:              &http.Client{Timeout: 30 * time.Second},
	}
}

// usdcAsset returns the classic Stellar USDC credit asset.
func (c *Client) usdcAsset() txnbuild.Asset {
	return txnbuild.CreditAsset{Code: "USDC", Issuer: c.USDCIssuer}
}

// GetMidPrice returns the current XLM/USDC mid price (USDC per XLM) from the
// Horizon order book.
func (c *Client) GetMidPrice(ctx context.Context) (float64, error) {
	endpoint := fmt.Sprintf(
		"%s/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=USDC&buying_asset_issuer=%s&limit=1",
		c.HorizonURL, c.USDCIssuer,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, fmt.Errorf("sdex: orderbook fetch: %w", err)
	}
	defer resp.Body.Close()

	var ob struct {
		Asks []struct{ Price string `json:"price"` } `json:"asks"`
		Bids []struct{ Price string `json:"price"` } `json:"bids"`
	}
	if err = json.NewDecoder(resp.Body).Decode(&ob); err != nil {
		return 0, fmt.Errorf("sdex: orderbook decode: %w", err)
	}
	if len(ob.Asks) == 0 || len(ob.Bids) == 0 {
		return 0, fmt.Errorf("sdex: XLM/USDC book has no liquidity on testnet")
	}
	ask, _ := strconv.ParseFloat(ob.Asks[0].Price, 64)
	bid, _ := strconv.ParseFloat(ob.Bids[0].Price, 64)
	return (ask + bid) / 2.0, nil
}

// BuyXLM sends exactly usdcToSpend USDC from the admin account and receives
// XLM via SDEX PathPaymentStrictSend.
// priceUSDCperXLM is used to calculate the expected XLM and minimum output.
// Returns estimated XLM received (≤ actual, slippage floor) and tx hash.
func (c *Client) BuyXLM(ctx context.Context, usdcToSpend, priceUSDCperXLM float64) (xlmReceived float64, txHash string, err error) {
	expectedXLM := usdcToSpend / priceUSDCperXLM
	minXLM := expectedXLM * slippage

	log.Printf("[sdex] BuyXLM: spend %.4f USDC, expect ~%.4f XLM @ %.6f", usdcToSpend, expectedXLM, priceUSDCperXLM)

	hash, err := c.submitPathPayment(ctx,
		c.usdcAsset(), formatAmount(usdcToSpend),
		txnbuild.NativeAsset{}, formatAmount(minXLM),
	)
	if err != nil {
		return 0, "", err
	}
	return expectedXLM, hash, nil
}

// SellXLM sends exactly xlmToSell XLM from the admin account and receives
// USDC via SDEX PathPaymentStrictSend.
// Returns estimated USDC received and tx hash.
func (c *Client) SellXLM(ctx context.Context, xlmToSell, priceUSDCperXLM float64) (usdcReceived float64, txHash string, err error) {
	expectedUSDC := xlmToSell * priceUSDCperXLM
	minUSDC := expectedUSDC * slippage

	log.Printf("[sdex] SellXLM: sell %.4f XLM, expect ~%.4f USDC @ %.6f", xlmToSell, expectedUSDC, priceUSDCperXLM)

	hash, err := c.submitPathPayment(ctx,
		txnbuild.NativeAsset{}, formatAmount(xlmToSell),
		c.usdcAsset(), formatAmount(minUSDC),
	)
	if err != nil {
		return 0, "", err
	}
	return expectedUSDC, hash, nil
}

// ── internal helpers ─────────────────────────────────────────────────────────

func (c *Client) submitPathPayment(
	ctx context.Context,
	sendAsset txnbuild.Asset, sendAmount string,
	destAsset txnbuild.Asset, destMin string,
) (string, error) {
	adminKP, err := keypair.ParseFull(c.AdminSecret)
	if err != nil {
		return "", fmt.Errorf("sdex: parse admin key: %w", err)
	}

	seq, err := c.getSequence(ctx, adminKP.Address())
	if err != nil {
		return "", err
	}

	sa := txnbuild.SimpleAccount{AccountID: adminKP.Address(), Sequence: seq}

	op := &txnbuild.PathPaymentStrictSend{
		SendAsset:   sendAsset,
		SendAmount:  sendAmount,
		Destination: adminKP.Address(), // self-payment crosses the SDEX
		DestAsset:   destAsset,
		DestMin:     destMin,
		Path:        []txnbuild.Asset{},
	}

	tx, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount:        &sa,
		IncrementSequenceNum: true,
		Operations:           []txnbuild.Operation{op},
		BaseFee:              txnbuild.MinBaseFee * 10,
		Preconditions:        txnbuild.Preconditions{TimeBounds: txnbuild.NewTimeout(60)},
	})
	if err != nil {
		return "", fmt.Errorf("sdex: build tx: %w", err)
	}

	tx, err = tx.Sign(c.NetworkPassphrase, adminKP)
	if err != nil {
		return "", fmt.Errorf("sdex: sign tx: %w", err)
	}

	b64, err := tx.Base64()
	if err != nil {
		return "", fmt.Errorf("sdex: encode tx: %w", err)
	}

	return c.submitXDR(ctx, b64)
}

// submitXDR posts a base64 transaction XDR to Horizon and returns the tx hash.
func (c *Client) submitXDR(ctx context.Context, b64 string) (string, error) {
	body := url.Values{"tx": {b64}}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.HorizonURL+"/transactions", strings.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("sdex: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("sdex: submit: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Hash   string `json:"hash"`
		Title  string `json:"title,omitempty"`
		Extras struct {
			ResultCodes struct {
				Transaction string   `json:"transaction"`
				Operations  []string `json:"operations"`
			} `json:"result_codes"`
		} `json:"extras"`
	}
	if err = json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("sdex: decode response: %w", err)
	}
	if resp.StatusCode >= 400 {
		rc := result.Extras.ResultCodes
		opCode := ""
		if len(rc.Operations) > 0 {
			opCode = " / " + rc.Operations[0]
		}
		return "", fmt.Errorf("sdex: horizon %s%s — admin account needs classic USDC (GBBD47…) trustline and balance",
			rc.Transaction, opCode)
	}
	log.Printf("[sdex] tx submitted hash=%s", result.Hash)
	return result.Hash, nil
}

// usdcBalanceOf returns (balance, hasTrustline, error) for the admin account.
func (c *Client) usdcBalanceOf(ctx context.Context, accountID string) (float64, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.HorizonURL+"/accounts/"+accountID, nil)
	if err != nil {
		return 0, false, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, false, fmt.Errorf("sdex: fetch account: %w", err)
	}
	defer resp.Body.Close()

	var acct struct {
		Balances []struct {
			AssetType   string `json:"asset_type"`
			AssetCode   string `json:"asset_code"`
			AssetIssuer string `json:"asset_issuer"`
			Balance     string `json:"balance"`
		} `json:"balances"`
	}
	if err = json.NewDecoder(resp.Body).Decode(&acct); err != nil {
		return 0, false, fmt.Errorf("sdex: decode account: %w", err)
	}
	for _, b := range acct.Balances {
		if b.AssetCode == "USDC" && b.AssetIssuer == c.USDCIssuer {
			var bal float64
			fmt.Sscanf(b.Balance, "%f", &bal)
			return bal, true, nil
		}
	}
	return 0, false, nil
}

// addUSDCTrustline submits a ChangeTrust operation to create a USDC trustline.
func (c *Client) addUSDCTrustline(ctx context.Context) error {
	adminKP, err := keypair.ParseFull(c.AdminSecret)
	if err != nil {
		return fmt.Errorf("sdex: parse admin key: %w", err)
	}
	seq, err := c.getSequence(ctx, adminKP.Address())
	if err != nil {
		return err
	}
	sa := txnbuild.SimpleAccount{AccountID: adminKP.Address(), Sequence: seq}
	op := &txnbuild.ChangeTrust{
		Line:  txnbuild.ChangeTrustAssetWrapper{Asset: c.usdcAsset()},
		Limit: "922337203685.4775807", // max
	}
	tx, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount:        &sa,
		IncrementSequenceNum: true,
		Operations:           []txnbuild.Operation{op},
		BaseFee:              txnbuild.MinBaseFee * 10,
		Preconditions:        txnbuild.Preconditions{TimeBounds: txnbuild.NewTimeout(60)},
	})
	if err != nil {
		return fmt.Errorf("sdex: build trustline tx: %w", err)
	}
	tx, err = tx.Sign(c.NetworkPassphrase, adminKP)
	if err != nil {
		return fmt.Errorf("sdex: sign trustline tx: %w", err)
	}
	b64, err := tx.Base64()
	if err != nil {
		return fmt.Errorf("sdex: encode trustline tx: %w", err)
	}
	_, err = c.submitXDR(ctx, b64)
	return err
}

// EnsureUSDC guarantees the admin account has at least minUSDC classic USDC.
// If the trustline is missing it creates one; if the balance is low it sells
// XLM for USDC on the SDEX automatically.
func (c *Client) EnsureUSDC(ctx context.Context, minUSDC float64) error {
	adminKP, err := keypair.ParseFull(c.AdminSecret)
	if err != nil {
		return fmt.Errorf("sdex: parse admin key: %w", err)
	}

	bal, hasTL, err := c.usdcBalanceOf(ctx, adminKP.Address())
	if err != nil {
		return err
	}

	if !hasTL {
		log.Printf("[sdex] EnsureUSDC: no USDC trustline — creating one")
		if err = c.addUSDCTrustline(ctx); err != nil {
			return fmt.Errorf("sdex: create USDC trustline: %w", err)
		}
		bal = 0
	}

	if bal >= minUSDC {
		return nil
	}

	// Sell XLM to get the required USDC.
	needed := minUSDC - bal + 1.0 // 1 USDC buffer
	price, err := c.GetMidPrice(ctx)
	if err != nil {
		return fmt.Errorf("sdex: get price for USDC bootstrap: %w", err)
	}
	xlmToSell := (needed / price) / slippage // account for slippage
	log.Printf("[sdex] EnsureUSDC: have %.4f USDC, need %.4f — selling %.4f XLM @ %.6f",
		bal, minUSDC, xlmToSell, price)
	_, _, err = c.SellXLM(ctx, xlmToSell, price)
	if err != nil {
		return fmt.Errorf("sdex: bootstrap USDC by selling XLM: %w", err)
	}
	return nil
}

// getSequence fetches the current ledger sequence number for an account.
func (c *Client) getSequence(ctx context.Context, accountID string) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.HorizonURL+"/accounts/"+accountID, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return 0, fmt.Errorf("sdex: horizon account: %w", err)
	}
	defer resp.Body.Close()

	var acct struct{ Sequence string `json:"sequence"` }
	if err = json.NewDecoder(resp.Body).Decode(&acct); err != nil {
		return 0, fmt.Errorf("sdex: decode account: %w", err)
	}
	return strconv.ParseInt(acct.Sequence, 10, 64)
}

// formatAmount converts a float64 to Stellar's 7-decimal string format.
func formatAmount(v float64) string {
	return strconv.FormatFloat(v, 'f', 7, 64)
}
