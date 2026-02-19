import { NextRequest, NextResponse } from 'next/server';
import { buildMarketOrderXdrBySymbol } from '@/actions/trade';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, symbol, side, amount, slippage } = body;

    if (!account || !symbol || !side || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: account, symbol, side, amount' },
        { status: 400 },
      );
    }

    if (side !== 'buy' && side !== 'sell') {
      return NextResponse.json({ error: 'side must be "buy" or "sell"' }, { status: 400 });
    }

    const result = await buildMarketOrderXdrBySymbol({
      accountId: account,
      pairSymbol: symbol,
      side,
      amount: String(amount),
      slippagePercent: slippage != null ? Number(slippage) : undefined,
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
