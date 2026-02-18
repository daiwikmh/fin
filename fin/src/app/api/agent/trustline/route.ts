import { NextRequest, NextResponse } from 'next/server';
import { getTrustlineStatus } from '@/actions/account';
import { getAsset } from '@/configs/assets';

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get('account');
  const assetCode = req.nextUrl.searchParams.get('asset');

  if (!account || !assetCode) {
    return NextResponse.json({ error: 'Missing ?account= and ?asset= parameters' }, { status: 400 });
  }

  const asset = getAsset(assetCode);
  if (!asset) {
    return NextResponse.json({ error: `Unknown asset: ${assetCode}` }, { status: 400 });
  }

  try {
    const status = await getTrustlineStatus(account, asset);
    return NextResponse.json({ account, asset: assetCode, status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
