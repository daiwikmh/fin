import * as StellarSdk from 'stellar-sdk';
import type {
  StellarAsset,
  OrderBook,
  OrderBookLevel,
  TrustlineStatus,
  TransactionResult,
  OpenOffer,
  Trade,
} from '@/types/sdex.types';
import { getNetwork } from '@/configs/assets';

// ── Helpers ────────────────────────────────────────────────────────────

function toSdkAsset(asset: StellarAsset): StellarSdk.Asset {
  if (asset.issuer === null) return StellarSdk.Asset.native();
  return new StellarSdk.Asset(asset.code, asset.issuer);
}

function horizon(): StellarSdk.Horizon.Server {
  return new StellarSdk.Horizon.Server(getNetwork().horizonUrl);
}

const BASE_FEE = '100';
const TIMEBOUND_SECONDS = 30;

function mapStellarError(error: unknown): { code: string; message: string } {
  const errStr = String(error);

  const mapping: Record<string, string> = {
    tx_bad_seq: 'Transaction sequence number is invalid. Please retry.',
    op_low_reserve: 'Account balance is too low to meet the minimum reserve.',
    op_no_trust: 'Trustline does not exist for this asset. Please add a trustline first.',
    op_offer_not_found: 'The offer was not found. It may have already been filled or cancelled.',
    op_underfunded: 'Insufficient balance to complete this operation.',
    op_line_full: 'The trustline balance limit would be exceeded.',
    op_cross_self: 'This order would cross your own existing offer.',
  };

  for (const [code, message] of Object.entries(mapping)) {
    if (errStr.includes(code)) {
      return { code, message };
    }
  }

  return { code: 'unknown', message: errStr };
}

// ── Order Book ─────────────────────────────────────────────────────────

export async function getOrderBook(
  selling: StellarAsset,
  buying: StellarAsset,
): Promise<OrderBook> {
  const server = horizon();
  const response = await server
    .orderbook(toSdkAsset(selling), toSdkAsset(buying))
    .limit(15)
    .call();

  const mapLevel = (r: { price: string; amount: string }): OrderBookLevel => ({
    price: r.price,
    amount: r.amount,
  });

  return {
    bids: response.bids.map(mapLevel),
    asks: response.asks.map(mapLevel),
  };
}

// ── Trustline ──────────────────────────────────────────────────────────

export async function checkTrustline(
  accountId: string,
  asset: StellarAsset,
): Promise<TrustlineStatus> {
  if (asset.issuer === null) {
    // Native XLM always trusted
    return { exists: true, isAuthorized: true, availableLimit: '' };
  }

  const server = horizon();
  try {
    const account = await server.loadAccount(accountId);
    const balance = account.balances.find(
      (b: StellarSdk.Horizon.HorizonApi.BalanceLine) =>
        'asset_code' in b &&
        b.asset_code === asset.code &&
        'asset_issuer' in b &&
        b.asset_issuer === asset.issuer,
    );

    if (!balance) {
      return { exists: false, isAuthorized: false, availableLimit: '0' };
    }

    return {
      exists: true,
      isAuthorized: !('is_authorized' in balance) || (balance as { is_authorized?: boolean }).is_authorized !== false,
      availableLimit: 'limit' in balance ? (balance as { limit: string }).limit : '0',
    };
  } catch {
    return { exists: false, isAuthorized: false, availableLimit: '0' };
  }
}

export async function buildCreateTrustlineTransaction(
  accountId: string,
  asset: StellarAsset,
): Promise<string> {
  const server = horizon();
  const account = await server.loadAccount(accountId);
  const network = getNetwork();

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.changeTrust({
        asset: toSdkAsset(asset),
      }),
    )
    .setTimeout(TIMEBOUND_SECONDS)
    .build();

  return tx.toXDR();
}

// ── Orders ─────────────────────────────────────────────────────────────

export async function buildLimitOrder(
  accountId: string,
  selling: StellarAsset,
  buying: StellarAsset,
  amount: string,
  price: string,
): Promise<string> {
  const server = horizon();
  const account = await server.loadAccount(accountId);
  const network = getNetwork();

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.manageSellOffer({
        selling: toSdkAsset(selling),
        buying: toSdkAsset(buying),
        amount,
        price,
        offerId: '0', // new offer
      }),
    )
    .setTimeout(TIMEBOUND_SECONDS)
    .build();

  return tx.toXDR();
}

export async function buildMarketOrder(
  accountId: string,
  selling: StellarAsset,
  buying: StellarAsset,
  sendAmount: string,
  slippagePercent: number,
): Promise<string> {
  const server = horizon();
  const account = await server.loadAccount(accountId);
  const network = getNetwork();

  // destMin = 0 with slippage applied means we accept any amount with slippage tolerance
  // For a true market order, use a very small destMin based on slippage
  const slippageFactor = 1 - slippagePercent / 100;
  // We'll use pathPaymentStrictSend — destMin can be "0.0000001" as minimum
  const destMin = (0.0000001 * slippageFactor).toFixed(7);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.pathPaymentStrictSend({
        sendAsset: toSdkAsset(selling),
        sendAmount,
        destination: accountId,
        destAsset: toSdkAsset(buying),
        destMin,
        path: [],
      }),
    )
    .setTimeout(TIMEBOUND_SECONDS)
    .build();

  return tx.toXDR();
}

export async function buildCancelOrder(
  accountId: string,
  offerId: string,
  selling: StellarAsset,
  buying: StellarAsset,
): Promise<string> {
  const server = horizon();
  const account = await server.loadAccount(accountId);
  const network = getNetwork();

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.manageSellOffer({
        selling: toSdkAsset(selling),
        buying: toSdkAsset(buying),
        amount: '0',
        price: '1', // price is irrelevant for cancellation
        offerId,
      }),
    )
    .setTimeout(TIMEBOUND_SECONDS)
    .build();

  return tx.toXDR();
}

// ── Sign & Submit ──────────────────────────────────────────────────────

export async function signAndSubmitTransaction(
  unsignedXDR: string,
  signTransaction: (xdr: string, networkPassphrase: string) => Promise<string>,
): Promise<TransactionResult> {
  const network = getNetwork();

  try {
    const signedXDR = await signTransaction(unsignedXDR, network.networkPassphrase);

    const tx = StellarSdk.TransactionBuilder.fromXDR(
      signedXDR,
      network.networkPassphrase,
    );

    const server = horizon();
    const response = await server.submitTransaction(tx as StellarSdk.Transaction);

    // Try to extract offer ID from result — guard every level against undefined
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
      // offerResults extraction is best-effort; non-critical
    }

    return {
      success: true,
      txHash: response.hash,
      offerId,
    };
  } catch (error: unknown) {
    const mapped = mapStellarError(error);
    return {
      success: false,
      errorCode: mapped.code,
      errorMessage: mapped.message,
    };
  }
}

// ── Account Data ───────────────────────────────────────────────────────

export async function getUserOpenOffers(
  accountId: string,
): Promise<OpenOffer[]> {
  const server = horizon();
  const response = await server
    .offers()
    .forAccount(accountId)
    .limit(50)
    .order('desc')
    .call();

  return response.records.map((record) => {
    const selling: StellarAsset =
      record.selling.asset_type === 'native'
        ? { code: 'XLM', issuer: null, name: 'Stellar Lumens', decimals: 7 }
        : {
            code: record.selling.asset_code!,
            issuer: record.selling.asset_issuer!,
            name: record.selling.asset_code!,
            decimals: 7,
          };

    const buying: StellarAsset =
      record.buying.asset_type === 'native'
        ? { code: 'XLM', issuer: null, name: 'Stellar Lumens', decimals: 7 }
        : {
            code: record.buying.asset_code!,
            issuer: record.buying.asset_issuer!,
            name: record.buying.asset_code!,
            decimals: 7,
          };

    return {
      offerId: String(record.id),
      selling,
      buying,
      amount: record.amount,
      price: record.price,
    };
  });
}

export async function getTradeHistory(
  accountId: string,
  limit: number = 20,
): Promise<Trade[]> {
  const server = horizon();
  const response = await server
    .trades()
    .forAccount(accountId)
    .limit(limit)
    .order('desc')
    .call();

  return response.records.map((record) => {
    const baseSelling: StellarAsset =
      record.base_asset_type === 'native'
        ? { code: 'XLM', issuer: null, name: 'Stellar Lumens', decimals: 7 }
        : {
            code: record.base_asset_code!,
            issuer: record.base_asset_issuer!,
            name: record.base_asset_code!,
            decimals: 7,
          };

    const baseBuying: StellarAsset =
      record.counter_asset_type === 'native'
        ? { code: 'XLM', issuer: null, name: 'Stellar Lumens', decimals: 7 }
        : {
            code: record.counter_asset_code!,
            issuer: record.counter_asset_issuer!,
            name: record.counter_asset_code!,
            decimals: 7,
          };

    return {
      id: record.id,
      baseSelling,
      baseBuying,
      baseAmount: record.base_amount,
      counterAmount: record.counter_amount,
      price: record.price
        ? typeof record.price === 'object'
          ? String(
              Number((record.price as unknown as { n: string }).n) /
                Number((record.price as unknown as { d: string }).d),
            )
          : String(record.price)
        : '0',
      timestamp: record.ledger_close_time,
      type: record.base_is_seller ? 'sell' : 'buy',
    };
  });
}
