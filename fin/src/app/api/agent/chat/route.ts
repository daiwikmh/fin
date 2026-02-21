import { NextRequest } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, stepCountIs, convertToModelMessages } from 'ai';
import { z } from 'zod';

import { setCurrentNetwork, getAsset, type NetworkId } from '@/configs/assets';
import { getMidPrice, getOrderBookBySymbol } from '@/actions/orderbook';
import { getOpenOffers, getTradeHistory, buildTrustlineXdrByCode, getTrustlineStatus } from '@/actions/account';
import { buildLimitOrderXdrBySymbol, buildMarketOrderXdrBySymbol } from '@/actions/trade';

// Use createOpenAI to target OpenRouter's base URL.
// Always call openrouter.chat() — not openrouter() — so the SDK sends to
// /chat/completions instead of the Responses API (/responses).
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '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',
});

export async function POST(req: NextRequest) {
  const { messages, walletAddress, network, activePair } = await req.json();

  const netId: NetworkId = network === 'MAINNET' ? 'MAINNET' : 'TESTNET';
  setCurrentNetwork(netId);

  const pairs =
    netId === 'MAINNET'
      ? ['XLM/USDC', 'AQUA/XLM', 'AQUA/USDC']
      : ['XLM/USDC', 'SRT/XLM', 'SRT/USDC'];

  const system = `You are a friendly Stellar DEX trading assistant built for beginners.

IMPORTANT FORMATTING RULES:
- Do NOT use Markdown.
- Do NOT use *, _, -, #, or backticks.
- Do NOT use bullet points or numbered lists.
- Use plain simple sentences only.
- Write like a normal human chat message.
- Keep it short and conversational.

Current context:
- Network: ${netId}
- Wallet: ${walletAddress || 'not connected — ask them to connect Freighter first'}
- Viewing: ${activePair ?? 'XLM/USDC'}
- Available pairs: ${pairs.join(', ')}

Rules:
1. You NEVER move funds yourself. You build unsigned XDR transactions.
2. Always explain simply before building an order.
3. If wallet is disconnected, ask user to connect.
4. Keep replies short and beginner-friendly.
5. When building an order, mention a preview card will appear.
`;
  // Convert v6 UIMessages → CoreMessages (the chat-completions "messages" array)
  const coreMessages = await convertToModelMessages(messages ?? []);

  // Runtime guard: catch any conversion failure before it becomes a cryptic 400
  if (!Array.isArray(coreMessages)) {
    console.error('[chat/route] convertToModelMessages returned non-array:', coreMessages);
    return new Response(JSON.stringify({ error: 'Invalid message format after conversion' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('[chat/route] →', JSON.stringify({ model: 'deepseek/deepseek-chat-v3-0324', messageCount: coreMessages.length, messages: coreMessages }, null, 2));

  const result = streamText({
    model: openrouter.chat('deepseek/deepseek-chat-v3-0324'),
    system,
    messages: coreMessages,
    stopWhen: stepCountIs(5),
    tools: {
      get_price: {
        description: 'Get the current mid-price for a trading pair.',
        inputSchema: z.object({
          symbol: z.string().describe('e.g. XLM/USDC'),
        }),
        execute: async ({ symbol }: { symbol: string }) => {
          try {
            const price = await getMidPrice(symbol);
            if (price === null) return { error: 'No price data available' };
            const [base, quote] = symbol.split('/');
            return { symbol, price, label: `1 ${base} = ${price.toFixed(6)} ${quote}` };
          } catch (e) {
            return { error: String(e) };
          }
        },
      },

      get_order_book: {
        description: 'Get the top buy and sell orders for a trading pair.',
        inputSchema: z.object({ symbol: z.string() }),
        execute: async ({ symbol }: { symbol: string }) => {
          try {
            const ob = await getOrderBookBySymbol(symbol);
            return {
              symbol,
              best_ask: ob.asks[0] ?? null,
              best_bid: ob.bids[0] ?? null,
              asks: ob.asks.slice(0, 5),
              bids: ob.bids.slice(0, 5),
            };
          } catch (e) {
            return { error: String(e) };
          }
        },
      },

      get_my_orders: {
        description: "Get the user's currently open orders on the DEX.",
        inputSchema: z.object({}),
        execute: async () => {
          if (!walletAddress) return { error: 'Wallet not connected' };
          try {
            const offers = await getOpenOffers(walletAddress);
            return {
              count: offers.length,
              offers: offers.map((o) => ({
                id: o.offerId,
                selling: `${o.amount} ${o.selling.code}`,
                price: `${o.price} ${o.buying.code}`,
              })),
            };
          } catch (e) {
            return { error: String(e) };
          }
        },
      },

      get_my_trades: {
        description: "Get the user's recent trade history.",
        inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(10) }),
        execute: async ({ limit }: { limit: number }) => {
          if (!walletAddress) return { error: 'Wallet not connected' };
          try {
            const trades = await getTradeHistory(walletAddress, limit);
            return {
              count: trades.length,
              trades: trades.slice(0, 5).map((t) => ({
                type: t.type,
                base: `${t.baseAmount} ${t.baseSelling.code}`,
                counter: `${t.counterAmount} ${t.baseBuying.code}`,
                price: t.price,
                when: new Date(t.timestamp).toLocaleString(),
              })),
            };
          } catch (e) {
            return { error: String(e) };
          }
        },
      },

      check_trustline: {
        description: 'Check if the user has a trustline for a specific asset (required to hold any non-XLM token).',
        inputSchema: z.object({ asset: z.string().describe('Asset code e.g. USDC') }),
        execute: async ({ asset }: { asset: string }) => {
          if (!walletAddress) return { error: 'Wallet not connected' };
          try {
            const stellarAsset = getAsset(asset);
            if (!stellarAsset) return { error: `Unknown asset: ${asset}` };
            if (stellarAsset.issuer === null) return { asset, status: 'XLM is native — no trustline needed' };
            const status = await getTrustlineStatus(walletAddress, stellarAsset);
            return { asset, exists: status.exists, authorized: status.isAuthorized };
          } catch (e) {
            return { error: String(e) };
          }
        },
      },

      build_trustline: {
        description: 'Build a transaction to add a trustline so the user can hold a new asset. Returns XDR for the user to sign.',
        inputSchema: z.object({ asset: z.string().describe('Asset code e.g. USDC') }),
        execute: async ({ asset }: { asset: string }) => {
          if (!walletAddress) return { error: 'Wallet not connected' };
          try {
            const result = await buildTrustlineXdrByCode(walletAddress, asset);
            return { ...result, action: 'trustline', asset, description: `Add ${asset} trustline to your account` };
          } catch (e) {
            return { error: String(e) };
          }
        },
      },

      build_limit_order: {
        description:
          'Build a limit order at a specific price. Returns unsigned XDR for the user to review and sign. Use when the user gives a specific price.',
        inputSchema: z.object({
          symbol: z.string().describe('Trading pair e.g. XLM/USDC'),
          side: z.enum(['buy', 'sell']),
          amount: z.string().describe('Amount of the base asset (left side of pair)'),
          price: z.string().describe('Price in quote asset per 1 base asset'),
        }),
        execute: async ({ symbol, side, amount, price }: { symbol: string; side: 'buy' | 'sell'; amount: string; price: string }) => {
          if (!walletAddress) return { error: 'Wallet not connected' };
          try {
            const result = await buildLimitOrderXdrBySymbol({
              accountId: walletAddress,
              pairSymbol: symbol,
              side,
              amount,
              price,
            });
            const [base, quote] = symbol.split('/');
            return {
              ...result,
              action: 'limit_order',
              description: `${side === 'buy' ? 'Buy' : 'Sell'} ${amount} ${base} @ ${price} ${quote}`,
            };
          } catch (e) {
            return { error: String(e) };
          }
        },
      },

      build_market_order: {
        description:
          'Build a market order at the best available price. Returns unsigned XDR for the user to review and sign.',
        inputSchema: z.object({
          symbol: z.string(),
          side: z.enum(['buy', 'sell']),
          amount: z.string().describe('Amount of the base asset to trade'),
          slippage: z.number().min(0.1).max(5).default(0.5).describe('Slippage tolerance %'),
        }),
        execute: async ({ symbol, side, amount, slippage }: { symbol: string; side: 'buy' | 'sell'; amount: string; slippage: number }) => {
          if (!walletAddress) return { error: 'Wallet not connected' };
          try {
            const result = await buildMarketOrderXdrBySymbol({
              accountId: walletAddress,
              pairSymbol: symbol,
              side,
              amount,
              slippagePercent: slippage,
            });
            const [base] = symbol.split('/');
            return {
              ...result,
              action: 'market_order',
              description: `Market ${side === 'buy' ? 'buy' : 'sell'} ${amount} ${base} (${slippage}% slippage)`,
            };
          } catch (e) {
            return { error: String(e) };
          }
        },
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
