import { NextRequest, NextResponse } from 'next/server';
import { getTradeHistory } from '@/actions/account';

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get('account');
  if (!account) {
    return NextResponse.json({ error: 'Missing ?account= parameter' }, { status: 400 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10);

  try {
    const trades = await getTradeHistory(account, limit);
    return NextResponse.json({ account, trades });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
