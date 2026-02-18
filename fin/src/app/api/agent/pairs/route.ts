import { NextResponse } from 'next/server';
import { getCurrentNetworkId, getAssets } from '@/configs/assets';
import { getTradingPairs } from '@/configs/tradingPairs';

export async function GET() {
  const network = getCurrentNetworkId();
  const pairs = getTradingPairs();
  const assets = getAssets();

  return NextResponse.json({ network, pairs, assets });
}
