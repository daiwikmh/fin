import { NextRequest, NextResponse } from 'next/server';
import { getOrderBookBySymbol, getMidPrice } from '@/actions/orderbook';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Missing ?symbol= parameter' }, { status: 400 });
  }

  try {
    const [orderBook, midPrice] = await Promise.all([
      getOrderBookBySymbol(symbol),
      getMidPrice(symbol),
    ]);
    return NextResponse.json({ symbol, midPrice, orderBook });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
