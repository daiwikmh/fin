import { NextRequest, NextResponse } from 'next/server';
import { buildLimitOrderXdrBySymbol } from '@/actions/trade';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, symbol, side, amount, price } = body;

    if (!account || !symbol || !side || !amount || !price) {
      return NextResponse.json(
        { error: 'Missing required fields: account, symbol, side, amount, price' },
        { status: 400 },
      );
    }

    if (side !== 'buy' && side !== 'sell') {
      return NextResponse.json({ error: 'side must be "buy" or "sell"' }, { status: 400 });
    }

    const result = await buildLimitOrderXdrBySymbol({
      accountId: account,
      pairSymbol: symbol,
      side,
      amount: String(amount),
      price: String(price),
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
