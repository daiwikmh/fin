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
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}
