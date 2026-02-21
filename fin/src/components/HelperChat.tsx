'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai';
import { useRef, useEffect, useState, useMemo } from 'react';
import { Send, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useWallet } from '@/utils/wallet';

interface HelperChatProps {
  selectedPair: string;
  network: string;
}

interface SignCardProps {
  xdr: string;
  networkPassphrase: string;
  description: string;
  signFn: (xdr: string, passphrase: string) => Promise<string>;
}

function SignCard({ xdr, networkPassphrase, description, signFn }: SignCardProps) {
  const [status, setStatus] = useState<'idle' | 'signing' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const handleSign = async () => {
    setStatus('signing');
    try {
      const signed = await signFn(xdr, networkPassphrase);
      const res = await fetch('/api/agent/tx/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedXdr: signed, networkPassphrase }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('success');
        setTxHash(data.txHash ?? '');
      } else {
        setStatus('error');
        setErrMsg(data.error ?? 'Transaction failed');
      }
    } catch (e) {
      setStatus('error');
      setErrMsg(String(e));
    }
  };

  return (
    <div
      style={{
        maxWidth: '92%',
        background: '#0d1f14',
        border: '1px solid rgba(0,255,148,0.2)',
        borderRadius: '10px',
        padding: '11px 13px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <span
        style={{
          fontSize: '10px',
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        Order Preview
      </span>
      <span style={{ fontSize: '13px', color: '#fff', fontWeight: 500 }}>{description}</span>

      {status === 'idle' && (
        <button
          onClick={handleSign}
          style={{
            padding: '6px 14px',
            background: 'rgba(0,255,148,0.12)',
            border: '1px solid rgba(0,255,148,0.3)',
            borderRadius: '7px',
            color: '#00ff94',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          Sign &amp; Submit →
        </button>
      )}
      {status === 'signing' && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
          <Loader2 size={11} className="animate-spin" />
          Waiting for wallet…
        </span>
      )}
      {status === 'success' && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#00ff94' }}>
          <CheckCircle size={12} />
          Submitted · {txHash.slice(0, 12)}…
        </span>
      )}
      {status === 'error' && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ff6b6b' }}>
          <XCircle size={12} />
          {errMsg}
        </span>
      )}
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  get_price: 'Checking price',
  get_order_book: 'Loading order book',
  get_my_orders: 'Loading your orders',
  get_my_trades: 'Loading trade history',
  check_trustline: 'Checking trustline',
  build_trustline: 'Building trustline tx',
  build_limit_order: 'Building limit order',
  build_market_order: 'Building market order',
};

const WELCOME_MSG: UIMessage = {
  id: 'welcome',
  role: 'assistant',
  parts: [
    {
      type: 'text',
      text: "Hi! I'm your Stellar trading assistant. I can check prices, show order books, and help you place trades. What would you like to do?",
    },
  ],
  metadata: {},
};

export default function HelperChat({ selectedPair, network }: HelperChatProps) {
  const { address, signTransaction } = useWallet();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  // Refs so transport closure reads latest prop values without recreation
  const walletRef = useRef(address);
  const networkRef = useRef(network);
  const pairRef = useRef(selectedPair);
  useEffect(() => { walletRef.current = address; }, [address]);
  useEffect(() => { networkRef.current = network; }, [network]);
  useEffect(() => { pairRef.current = selectedPair; }, [selectedPair]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/agent/chat',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages,
            walletAddress: walletRef.current,
            network: networkRef.current,
            activePair: pairRef.current,
          },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    messages: [WELCOME_MSG],
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Messages ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: '5px',
            }}
          >
            {(msg.parts as UIMessage['parts']).map((part, pi) => {
              if (part.type === 'text') {
                return part.text ? (
                  <div
                    key={pi}
                    style={{
                      maxWidth: '88%',
                      padding: '8px 11px',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: msg.role === 'user' ? 'rgba(0,255,148,0.08)' : '#141414',
                      border: '1px solid',
                      borderColor: msg.role === 'user' ? 'rgba(0,255,148,0.15)' : '#1e1e1e',
                      color: '#e8e8e8',
                      fontSize: '12.5px',
                      lineHeight: '1.55',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {part.text}
                  </div>
                ) : null;
              }

              if (isToolUIPart(part)) {
                // part.type is 'tool-{name}' for inline tools — extract the name
                const toolName = part.type.startsWith('tool-')
                  ? part.type.slice(5)
                  : (part as { toolName?: string }).toolName ?? '';
                const tp = part as { state: string; output?: unknown; errorText?: string };

                if (tp.state === 'input-streaming' || tp.state === 'input-available') {
                  return (
                    <span
                      key={pi}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.35)',
                      }}
                    >
                      <Loader2 size={10} className="animate-spin" />
                      {TOOL_LABELS[toolName] ?? 'Processing'}…
                    </span>
                  );
                }
                if (tp.state === 'output-error') {
                  return (
                    <div
                      key={pi}
                      style={{
                        fontSize: '12px',
                        color: '#ff6b6b',
                        padding: '6px 10px',
                        background: 'rgba(255,107,107,0.08)',
                        border: '1px solid rgba(255,107,107,0.2)',
                        borderRadius: '8px',
                        maxWidth: '88%',
                      }}
                    >
                      {tp.errorText ?? 'Tool error'}
                    </div>
                  );
                }
                if (tp.state === 'output-available') {
                  const r = tp.output as { xdr?: string; networkPassphrase?: string; description?: string; error?: string } | null;
                  if (r?.xdr && r.networkPassphrase && r.description) {
                    return (
                      <SignCard
                        key={pi}
                        xdr={r.xdr}
                        networkPassphrase={r.networkPassphrase}
                        description={r.description}
                        signFn={signTransaction}
                      />
                    );
                  }
                  if (r?.error) {
                    return (
                      <div
                        key={pi}
                        style={{
                          fontSize: '12px',
                          color: '#ff6b6b',
                          padding: '6px 10px',
                          background: 'rgba(255,107,107,0.08)',
                          border: '1px solid rgba(255,107,107,0.2)',
                          borderRadius: '8px',
                          maxWidth: '88%',
                        }}
                      >
                        {r.error}
                      </div>
                    );
                  }
                }
              }

              return null;
            })}
          </div>
        ))}

        {/* Typing indicator while waiting for first assistant token */}
        {isLoading && messages.at(-1)?.role !== 'assistant' && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11px',
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            <Loader2 size={10} className="animate-spin" />
            Thinking…
          </span>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <form
        onSubmit={onSubmit}
        style={{
          flexShrink: 0,
          borderTop: '1px solid #1a1a1a',
          padding: '10px 12px',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything…"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
            }
          }}
          style={{
            flex: 1,
            background: '#0a0a0a',
            border: '1px solid #1e1e1e',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '12.5px',
            padding: '7px 10px',
            resize: 'none',
            minHeight: '34px',
            maxHeight: '96px',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: '1.4',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            width: '32px',
            height: '32px',
            flexShrink: 0,
            borderRadius: '8px',
            background: isLoading || !input.trim() ? 'transparent' : 'rgba(0,255,148,0.12)',
            border: '1px solid',
            borderColor: isLoading || !input.trim() ? '#1e1e1e' : 'rgba(0,255,148,0.25)',
            color: isLoading || !input.trim() ? 'rgba(255,255,255,0.2)' : '#00ff94',
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </button>
      </form>
    </div>
  );
}
