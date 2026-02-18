import { NextRequest, NextResponse } from 'next/server';
import { getOpenOffers } from '@/actions/account';

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get('account');
  if (!account) {
    return NextResponse.json({ error: 'Missing ?account= parameter' }, { status: 400 });
  }

  try {
    const offers = await getOpenOffers(account);
    return NextResponse.json({ account, offers });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
