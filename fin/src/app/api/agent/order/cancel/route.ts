import { NextRequest, NextResponse } from 'next/server';
import { buildCancelOfferXdr } from '@/actions/trade';
import { getAssetPair } from '@/configs/assets';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, offerId, symbol } = body;

    if (!account || !offerId || !symbol) {
      return NextResponse.json(
        { error: 'Missing required fields: account, offerId, symbol' },
        { status: 400 },
      );
    }

    const pair = getAssetPair(symbol);
    if (!pair) {
      return NextResponse.json({ error: `Unknown pair: ${symbol}` }, { status: 400 });
    }

    const result = await buildCancelOfferXdr({
      accountId: account,
      offer: {
        offerId: String(offerId),
        selling: pair[0],
        buying: pair[1],
        amount: '0',
        price: '1',
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
