import { NextRequest, NextResponse } from 'next/server';
import { buildTrustlineXdrByCode } from '@/actions/account';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, asset } = body;

    if (!account || !asset) {
      return NextResponse.json(
        { error: 'Missing required fields: account, asset' },
        { status: 400 },
      );
    }

    const result = await buildTrustlineXdrByCode(account, asset);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
