/**
 * bridge.ts — Utilities for syncing frontend state to the agent bridge.
 *
 * The bridge keeps an in-memory UserContext per token so the AI agent always
 * knows which trading pair the user is looking at and can react proactively
 * when market conditions change on that pair.
 *
 * Usage example (TypeScript Action Layer):
 *
 *   import { storeBridgeToken, syncViewToBridge, registerAccountWithBridge } from '@/utils/bridge';
 *
 *   // After generating a token:
 *   storeBridgeToken(token);
 *
 *   // After wallet connects:
 *   await registerAccountWithBridge(token, walletAddress, 'TESTNET');
 *
 *   // When the user switches trading pairs:
 *   await syncViewToBridge('XLM/USDC', 'TESTNET');
 */

const BRIDGE_URL = process.env.NEXT_PUBLIC_AGENT_BRIDGE_URL || 'http://localhost:8090';
const STORAGE_KEY = 'bridge_token';

/** Read the stored bridge token (returns null in SSR context). */
export function getStoredBridgeToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

/** Persist the bridge token so useSdex can sync view changes. */
export function storeBridgeToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, token);
}

/**
 * Syncs the active trading pair and network to the bridge context.
 * Called by useSdex whenever selectedPair or network changes.
 * Fire-and-forget — never throws or blocks the UI.
 */
export async function syncViewToBridge(pair: string, network: string): Promise<void> {
  const token = getStoredBridgeToken();
  if (!token) return;
  try {
    await fetch(`${BRIDGE_URL}/api/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, active_pair: pair, network }),
    });
  } catch {
    // Best-effort: never block the UI on bridge availability.
  }
}

/**
 * Registers the connected Stellar account with the bridge, which starts
 * a background goroutine that streams transactions for that account and
 * pushes context_update events to the SSE log stream.
 */
export async function registerAccountWithBridge(
  token: string,
  accountId: string,
  network: string,
): Promise<void> {
  try {
    await fetch(`${BRIDGE_URL}/api/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, account_id: accountId, network }),
    });
  } catch {
    // Best-effort.
  }
}
