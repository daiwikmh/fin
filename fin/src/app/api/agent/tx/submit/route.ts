import { NextRequest, NextResponse } from 'next/server';
import * as StellarSdk from 'stellar-sdk';
import { NETWORKS } from '@/configs/assets';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { signedXdr, networkPassphrase } = body;

    if (!signedXdr) {
      return NextResponse.json(
        { error: 'Missing required field: signedXdr' },
        { status: 400 },
      );
    }

    // Resolve network config from the passphrase sent by the client.
    // Fallback to TESTNET so legacy callers without networkPassphrase still work.
    const network =
      Object.values(NETWORKS).find((n) => n.networkPassphrase === networkPassphrase) ??
      NETWORKS.TESTNET;

    const tx = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      network.networkPassphrase,
    );

    const server = new StellarSdk.Horizon.Server(network.horizonUrl);
    const response = await server.submitTransaction(tx as StellarSdk.Transaction);

    let offerId: string | undefined;
    try {
      const raw = response as unknown as Record<string, unknown>;
      const offerResults = raw.offerResults;
      if (Array.isArray(offerResults) && offerResults.length > 0) {
        const first = offerResults[0] as Record<string, unknown> | undefined;
        const currentOffer = first?.currentOffer as Record<string, unknown> | undefined;
        if (currentOffer?.offerId != null) {
          offerId = String(currentOffer.offerId);
        }
      }
    } catch {
      // best-effort offer ID extraction
    }

    return NextResponse.json({
      success: true,
      txHash: response.hash,
      offerId,
    });
  } catch (e) {
    // Extract human-readable error from Horizon's response body when available.
    // The Stellar SDK uses axios; a 400 from Horizon will be an AxiosError with
    // response.data.extras.result_codes containing the actual op codes.
    const horizonError = extractHorizonError(e);
    return NextResponse.json(
      { success: false, error: horizonError },
      { status: 500 },
    );
  }
}

const OP_MESSAGES: Record<string, string> = {
  op_no_trust: 'Missing trustline — you need to add a trustline for this asset before trading it.',
  op_underfunded: 'Insufficient balance to complete this trade.',
  op_low_reserve: 'Account balance too low to meet the minimum reserve.',
  op_bad_auth: 'Transaction authorisation failed.',
  op_no_destination: 'Destination account does not exist.',
  op_line_full: 'Trustline limit would be exceeded.',
  op_cross_self: 'This order would cross one of your own existing offers.',
  op_offer_not_found: 'Offer not found — it may have already been filled or cancelled.',
  op_too_few_offers: 'Not enough liquidity available for this trade.',
  op_over_source_max: 'Exchange rate moved too far — try increasing slippage tolerance.',
  tx_bad_seq: 'Sequence number mismatch — please refresh and try again.',
  tx_insufficient_fee: 'Network fee too low.',
};

function extractHorizonError(e: unknown): string {
  try {
    const err = e as { response?: { data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } } } };
    const codes = err?.response?.data?.extras?.result_codes;
    if (codes) {
      const all = [codes.transaction, ...(codes.operations ?? [])].filter(Boolean) as string[];
      // Return first recognised human-readable message, or the raw codes.
      for (const code of all) {
        if (OP_MESSAGES[code]) return OP_MESSAGES[code];
      }
      return `Transaction failed: ${all.join(', ')}`;
    }
  } catch { /* fall through */ }
  return String(e);
}
