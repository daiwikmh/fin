import { NextRequest, NextResponse } from 'next/server';
import { getMidPrice } from '@/actions/orderbook';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Missing ?symbol= parameter' }, { status: 400 });
  }

  try {
    const midPrice = await getMidPrice(symbol);
    return NextResponse.json({ symbol, midPrice });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
