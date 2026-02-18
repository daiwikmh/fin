'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Wallet, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';

const BRIDGE_URL = process.env.NEXT_PUBLIC_AGENT_BRIDGE_URL || 'http://localhost:8090';

type ConnectionState = 'disconnected' | 'generating' | 'token_ready' | 'connected';

interface LogEntry {
  message: string;
  source: string;
  timestamp: string;
}

interface RightSidebarProps {
  isVisible: boolean;
  onToggle: () => void;
}

export default function RightSidebar({ isVisible, onToggle }: RightSidebarProps) {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [token, setToken] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const handleConnect = useCallback(async () => {
    setState('generating');
    try {
      const res = await fetch(`${BRIDGE_URL}/api/token/generate`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate token');
      const data = await res.json();
      const newToken = data.token;
      setToken(newToken);
      setState('token_ready');

      const es = new EventSource(`${BRIDGE_URL}/api/logs/stream?token=${newToken}`);
      eventSourceRef.current = es;

      es.addEventListener('connected', () => {
        setState('connected');
      });

      es.onmessage = (event) => {
        try {
          const entry: LogEntry = JSON.parse(event.data);
          setLogs((prev) => [...prev, entry]);
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        // EventSource will auto-reconnect
      };
    } catch {
      setState('disconnected');
    }
  }, []);

  const getConfigJson = useCallback(() => {
    return JSON.stringify({
      token,
      bridge_url: BRIDGE_URL,
      skills_endpoint: `${BRIDGE_URL}/api/skills?token=${token}`,
      execute_endpoint: `${BRIDGE_URL}/api/bridge`,
      auth_header: 'X-Agent-Token',
    }, null, 2);
  }, [token]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [token]);

  const [configCopied, setConfigCopied] = useState(false);
  const handleCopyConfig = useCallback(() => {
    navigator.clipboard.writeText(getConfigJson());
    setConfigCopied(true);
    setTimeout(() => setConfigCopied(false), 2000);
  }, [getConfigJson]);

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return '';
    }
  };

  return (
    <>
      <button
        onClick={onToggle}
        className="sidebar-toggle right"
        style={{ right: isVisible ? '320px' : '0px' }}
      >
        {isVisible ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className={`sidebar sidebar-right ${!isVisible ? 'hidden' : ''}`}>
        <div className="sidebar-header">
          <h3 className="sidebar-title">Agentic Actions</h3>
        </div>

        {state === 'disconnected' && (
          <div className="portfolio-content">
            <div className="portfolio-cta">
              <div className="portfolio-icon-wrapper">
                <div className="portfolio-icon-bg">
                  <div className="portfolio-icon-gradient"></div>
                  <div className="portfolio-icon">
                    <Wallet className="w-12 h-12" />
                  </div>
                </div>
              </div>
              <h4 className="portfolio-title">Connect OpenClaw</h4>
              <p className="portfolio-description">
                Connect your Openclaw to start your agentic journey
              </p>
              <button className="connect-wallet-btn" onClick={handleConnect}>
                Connect telegram
              </button>
            </div>
          </div>
        )}

        {state === 'generating' && (
          <div className="portfolio-content">
            <div className="portfolio-cta">
              <div className="portfolio-icon-wrapper">
                <div className="portfolio-icon-bg">
                  <div className="portfolio-icon-gradient"></div>
                  <div className="portfolio-icon">
                    <Wallet className="w-12 h-12" />
                  </div>
                </div>
              </div>
              <button className="connect-wallet-btn" disabled>
                Generating...
              </button>
            </div>
          </div>
        )}

        {(state === 'token_ready' || state === 'connected') && (
          <div className="agent-panel">
            <div className="agent-token-display">
              <span className="agent-token-label">Your token:</span>
              <div className="agent-token-row">
                <code className="agent-token-value">{token}</code>
                <button className="agent-token-copy-btn" onClick={handleCopy}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <span className="agent-token-hint">Send this token to your Telegram bot</span>
            </div>

            <div className="agent-config-snippet">
              <div className="agent-config-header">
                <span className="agent-config-label">Agent Config</span>
                <button className="agent-token-copy-btn" onClick={handleCopyConfig}>
                  {configCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <pre className="agent-config-code">{getConfigJson()}</pre>
            </div>

            <div className="agent-terminal">
              <div className="agent-terminal-header">
                <span className="agent-terminal-title">Agent Logs</span>
                <span className={`agent-terminal-dot ${state === 'connected' ? 'live' : ''}`} />
              </div>
              <div className="agent-terminal-body">
                {logs.length === 0 && (
                  <div className="agent-terminal-empty">Waiting for agent logs...</div>
                )}
                {logs.map((entry, i) => (
                  <div className="agent-log-entry" key={i}>
                    <span className="agent-log-time">{formatTime(entry.timestamp)}</span>
                    <span className="agent-log-msg">{entry.message}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
