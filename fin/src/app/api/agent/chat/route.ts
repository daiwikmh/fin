import { NextRequest } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, stepCountIs, convertToModelMessages } from 'ai';
import { z } from 'zod';

import { setCurrentNetwork, getAsset, type NetworkId } from '@/configs/assets';
import { getMidPrice, getOrderBookBySymbol } from '@/actions/orderbook';
import { getOpenOffers, getTradeHistory, buildTrustlineXdrByCode, getTrustlineStatus } from '@/actions/account';
import { buildLimitOrderXdrBySymbol, buildMarketOrderXdrBySymbol, buildBuyMarketOrderXdrBySymbol } from '@/actions/trade';

// Use createOpenAI to target OpenRouter's base URL.
// Always call openrouter.chat() — not openrouter() — so the SDK sends to
// /chat/completions instead of the Responses API (/responses).
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
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
2. When the user asks to buy, sell, or place any order, call build_market_order or build_limit_order IMMEDIATELY as your very first action. Do NOT call check_trustline, get_price, get_order_book, or any other tool first. Do NOT describe what you are about to do. Call the build tool first, then write one short sentence after.
3. If wallet is disconnected, ask user to connect before calling any build tool.
4. Keep replies short and beginner-friendly. Output ONLY clean plain text — no code blocks, no internal reasoning, no function names, no JSON.
5. After the build tool runs, tell the user to review and sign the preview card that appeared.
6. If a tool returns count=0 or an empty list, that is a valid result — tell the user plainly (e.g. "You have no trades yet"). Never treat an empty result as an error.
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
    onStepFinish: ({ stepNumber, toolCalls, toolResults, text }) => {
      console.log('[chat/step]', { stepNumber, toolCallCount: toolCalls?.length, text: text?.slice(0, 80) });
      toolCalls?.forEach(tc => console.log('  tool call:', tc.toolName, JSON.stringify(tc.input)));
      toolResults?.forEach(tr => {
        const r = tr.output as Record<string, unknown>;
        console.log('  tool result:', tr.toolName, r?.error ? `ERROR: ${r.error}` : `xdr=${!!(r?.xdr)}, desc=${r?.description}`);
      });
    },
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
            if (offers.length === 0) {
              return { count: 0, offers: [], message: 'No open orders. This account has no active DEX offers.' };
            }
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
            if (trades.length === 0) {
              return { count: 0, trades: [], message: 'No trades found. This account has not made any DEX trades yet.' };
            }
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
            const [base, quote] = symbol.split('/');
            const ob = await getOrderBookBySymbol(symbol);

            let description: string;
            let result: { xdr: string; networkPassphrase: string };

            if (side === 'buy') {
              // pathPaymentStrictReceive: user receives EXACTLY `amount` of base (XLM).
              // We pay at most sendMax of quote (USDC), calculated from the ask price
              // plus a slippage buffer so the order doesn't get rejected on price movement.
              const askPrice = parseFloat(ob.asks[0]?.price ?? '0');
              if (!askPrice) return { error: `No sell offers for ${symbol}` };
              const usdcEstimate = parseFloat(amount) * askPrice;
              const sendMax = (usdcEstimate * (1 + slippage / 100)).toFixed(7);
              description = `Market buy ${amount} ${base} (~${usdcEstimate.toFixed(4)} ${quote} at ask ${askPrice.toFixed(6)})`;
              result = await buildBuyMarketOrderXdrBySymbol({
                accountId: walletAddress,
                pairSymbol: symbol,
                destAmount: parseFloat(amount).toFixed(7),
                sendMax,
              });
            } else {
              // pathPaymentStrictSend: user sells EXACTLY `amount` of base (XLM).
              const bidPrice = parseFloat(ob.bids[0]?.price ?? '0');
              if (!bidPrice) return { error: `No buy offers for ${symbol}` };
              const sendAmount = parseFloat(amount).toFixed(7);
              description = `Market sell ${amount} ${base} (~${(parseFloat(amount) * bidPrice).toFixed(4)} ${quote} at bid ${bidPrice.toFixed(6)})`;
              result = await buildMarketOrderXdrBySymbol({
                accountId: walletAddress,
                pairSymbol: symbol,
                side,
                amount: sendAmount,
                slippagePercent: slippage,
              });
            }

            return { ...result, action: 'market_order', description };
          } catch (e) {
            console.error('[build_market_order] error:', e);
            return { error: String(e) };
          }
        },
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
