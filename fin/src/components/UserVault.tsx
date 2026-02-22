'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useWallet } from '@/utils/wallet';
import * as contracts from '@/utils/contracts';

type UVTab    = 'vault' | 'collateral';
type Action   = 'deposit' | 'withdraw';
type TxStatus = { ok: boolean; msg: string } | null;

export default function UserVault() {
  const { address, isConnected, connectWallet, signTransaction } = useWallet();

  const [tab,    setTab]    = useState<UVTab>('vault');
  const [action, setAction] = useState<Action>('deposit');

  // Vault
  const [vAmount,  setVAmount]  = useState('');
  const [vBalance, setVBalance] = useState<number | null>(null);
  const [vBusy,    setVBusy]    = useState(false);
  const [vStatus,  setVStatus]  = useState<TxStatus>(null);

  // Collateral
  const [cAmount,   setCAmount]   = useState('');
  const [cBalance,  setCBalance]  = useState<number | null>(null);
  const [position,  setPosition]  = useState<contracts.Position | null>(null);
  const [cBusy,     setCBusy]     = useState(false);
  const [cStatus,   setCStatus]   = useState<TxStatus>(null);

  // Refresh balances + position
  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const [vBal, cBal, pos] = await Promise.all([
        contracts.getVaultBalance(address, contracts.USDC_CONTRACT),
        contracts.getCollateralBalance(address, contracts.USDC_CONTRACT),
        contracts.getPosition(address),
      ]);
      setVBalance(vBal);
      setCBalance(cBal);
      setPosition(pos);
    } catch (err) {
      console.error('[UserVault] refresh:', err);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) refresh();
  }, [isConnected, address, refresh]);

  // Vault deposit / withdraw
  const handleVault = async () => {
    if (!address || !vAmount) return;
    setVBusy(true);
    setVStatus(null);
    try {
      const amount = parseFloat(vAmount);
      const fn = action === 'deposit' ? contracts.vaultDeposit : contracts.vaultWithdraw;
      const txXdr    = await fn(address, contracts.USDC_CONTRACT, amount);
      const signedXdr = await signTransaction(txXdr, contracts.NETWORK_PASSPHRASE);
      await contracts.submitAndWait(signedXdr);
      setVStatus({
        ok:  true,
        msg: `${action === 'deposit' ? 'Deposited' : 'Withdrawn'} ${amount} USDC ✓`,
      });
      setVAmount('');
      await refresh();
    } catch (err) {
      setVStatus({ ok: false, msg: String(err) });
    } finally {
      setVBusy(false);
    }
  };

  // Collateral deposit / withdraw
  const handleCollateral = async () => {
    if (!address || !cAmount) return;
    setCBusy(true);
    setCStatus(null);
    try {
      const amount = parseFloat(cAmount);
      const fn     = action === 'deposit' ? contracts.depositCollateral : contracts.withdrawCollateral;
      const txXdr    = await fn(address, contracts.USDC_CONTRACT, amount);
      const signedXdr = await signTransaction(txXdr, contracts.NETWORK_PASSPHRASE);
      await contracts.submitAndWait(signedXdr);
      setCStatus({
        ok:  true,
        msg: `Collateral ${action === 'deposit' ? 'deposited' : 'withdrawn'}: ${amount} USDC ✓`,
      });
      setCAmount('');
      await refresh();
    } catch (err) {
      setCStatus({ ok: false, msg: String(err) });
    } finally {
      setCBusy(false);
    }
  };

  /* ── Not connected ── */
  if (!isConnected) {
    return (
      <div className="uv-wrapper">
        <div className="uv-header">
          <span className="uv-title">User Vault</span>
          <span className="uv-badge">Testnet</span>
        </div>
        <div className="uv-connect-prompt">
          <p>Connect your Stellar wallet to deposit funds and manage collateral.</p>
          <button className="uv-btn-submit" style={{ marginTop: '0.75rem' }} onClick={connectWallet}>
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  /* ── Connected ── */
  return (
    <div className="uv-wrapper">
      {/* Header */}
      <div className="uv-header">
        <div>
          <span className="uv-title">User Vault</span>
          <div className="uv-addr">{address!.slice(0, 6)}…{address!.slice(-4)}</div>
        </div>
        <button className="uv-refresh" onClick={refresh} title="Refresh balances">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Tabs */}
      <div className="uv-tabs">
        <button
          className={`uv-tab ${tab === 'vault' ? 'active' : ''}`}
          onClick={() => setTab('vault')}
        >
          AgentVault
        </button>
        <button
          className={`uv-tab ${tab === 'collateral' ? 'active' : ''}`}
          onClick={() => setTab('collateral')}
        >
          Collateral
        </button>
      </div>

      {/* Body */}
      <div className="uv-body">

        {/* ── VAULT TAB ── */}
        {tab === 'vault' && (
          <>
            <div className="uv-balance-row">
              <span className="uv-balance-label">Vault Balance</span>
              <span className="uv-balance-value">
                {vBalance !== null ? `${vBalance.toFixed(4)} USDC` : '—'}
              </span>
            </div>

            <div className="uv-hint">
              Funds in the vault earn yield backing leveraged traders. Depositing
              credits your vault account; withdrawing returns funds to your wallet.
            </div>

            <div className="uv-action-toggle">
              <button
                className={`uv-action-btn ${action === 'deposit' ? 'active' : ''}`}
                onClick={() => setAction('deposit')}
              >
                Deposit
              </button>
              <button
                className={`uv-action-btn ${action === 'withdraw' ? 'active' : ''}`}
                onClick={() => setAction('withdraw')}
              >
                Withdraw
              </button>
            </div>

            <div className="uv-field">
              <span className="uv-field-label">AMOUNT (USDC)</span>
              <input
                className="uv-input"
                type="number"
                step="0.01"
                min="0"
                value={vAmount}
                onChange={(e) => setVAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="uv-contract-hint">
              USDC · {contracts.USDC_CONTRACT.slice(0, 8)}…
            </div>

            <button
              className="uv-btn-submit"
              onClick={handleVault}
              disabled={vBusy || !vAmount || parseFloat(vAmount) <= 0}
            >
              {vBusy
                ? <><Loader2 size={13} className="animate-spin" /> Waiting for wallet…</>
                : action === 'deposit' ? 'Deposit to Vault' : 'Withdraw from Vault'
              }
            </button>

            {vStatus && <UVToast status={vStatus} onClose={() => setVStatus(null)} />}
          </>
        )}

        {/* ── COLLATERAL TAB ── */}
        {tab === 'collateral' && (
          <>
            <div className="uv-balance-row">
              <span className="uv-balance-label">Free Collateral</span>
              <span className="uv-balance-value">
                {cBalance !== null ? `${cBalance.toFixed(4)} USDC` : '—'}
              </span>
            </div>

            {/* Open position card */}
            {position ? (
              <div className="uv-position-card">
                <div className="uv-position-title">Open Position</div>
                <div className="uv-position-row">
                  <span>Asset</span>
                  <span>{position.asset_symbol}</span>
                </div>
                <div className="uv-position-row">
                  <span>Notional debt</span>
                  <span>{position.debt_amount.toFixed(4)} USDC</span>
                </div>
                <div className="uv-position-row">
                  <span>Locked collateral</span>
                  <span>{position.collateral_locked.toFixed(4)} USDC</span>
                </div>
                <div className="uv-position-row">
                  <span>Effective leverage</span>
                  <span>
                    {position.collateral_locked > 0
                      ? `${(position.debt_amount / position.collateral_locked).toFixed(1)}×`
                      : '—'
                    }
                  </span>
                </div>
              </div>
            ) : (
              <div className="uv-no-position">No open position</div>
            )}

            <div className="uv-hint">
              Deposit USDC here as free collateral. When the matching engine fills
              your leveraged order it locks part of this balance and records the
              position on-chain.
            </div>

            <div className="uv-action-toggle">
              <button
                className={`uv-action-btn ${action === 'deposit' ? 'active' : ''}`}
                onClick={() => setAction('deposit')}
              >
                Deposit
              </button>
              <button
                className={`uv-action-btn ${action === 'withdraw' ? 'active' : ''}`}
                onClick={() => setAction('withdraw')}
              >
                Withdraw
              </button>
            </div>

            <div className="uv-field">
              <span className="uv-field-label">AMOUNT (USDC)</span>
              <input
                className="uv-input"
                type="number"
                step="0.01"
                min="0"
                value={cAmount}
                onChange={(e) => setCAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="uv-contract-hint">
              USDC · {contracts.USDC_CONTRACT.slice(0, 8)}…
            </div>

            <button
              className="uv-btn-submit"
              onClick={handleCollateral}
              disabled={cBusy || !cAmount || parseFloat(cAmount) <= 0}
            >
              {cBusy
                ? <><Loader2 size={13} className="animate-spin" /> Waiting for wallet…</>
                : action === 'deposit' ? 'Deposit Collateral' : 'Withdraw Collateral'
              }
            </button>

            {cStatus && <UVToast status={cStatus} onClose={() => setCStatus(null)} />}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="uv-footer">
        <div className="uv-contract-row">
          <span>Vault</span>
          <span>{contracts.VAULT_CONTRACT.slice(0, 8)}…</span>
        </div>
        <div className="uv-contract-row">
          <span>Pool</span>
          <span>{contracts.LEVERAGE_CONTRACT.slice(0, 8)}…</span>
        </div>
      </div>
    </div>
  );
}

function UVToast({
  status,
  onClose,
}: {
  status: { ok: boolean; msg: string };
  onClose: () => void;
}) {
  return (
    <div className={`uv-toast ${status.ok ? 'success' : 'error'}`}>
      <span style={{ flex: 1 }}>{status.msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', paddingLeft: '0.5rem' }}>×</button>
    </div>
  );
}
