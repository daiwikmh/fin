"use client";

import { useMemo } from "react";

const HEX = "0123456789abcdef";

function rand(n: number) {
  return Math.floor(Math.random() * n);
}

function hex(len: number) {
  return Array.from({ length: len }, () => HEX[rand(16)]).join("");
}

function addr() {
  return `0x${hex(40)}`;
}

function ts() {
  const h = rand(24).toString().padStart(2, "0");
  const m = rand(60).toString().padStart(2, "0");
  const s = rand(60).toString().padStart(2, "0");
  const ms = rand(1000).toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function generateLines(count: number): string[] {
  const lines: string[] = [];
  const statuses = ["CONFIRMED", "FINALIZED", "SUBMITTED", "PENDING", "EXECUTED", "VALIDATED"];
  const ops = ["transfer", "stake", "unstake", "swap", "bridge", "mint", "burn", "delegate"];
  const tokens = ["TEMPO", "USDC", "USDT", "ETH", "SOL", "BTC"];

  for (let i = 0; i < count; i++) {
    const type = i % 10;

    if (type === 0) {
      // Full tx line with from/to/value/gas
      const value = (Math.random() * 50_000).toFixed(6);
      const token = tokens[rand(tokens.length)];
      const gas = rand(200_000) + 21_000;
      const fee = (Math.random() * 0.005).toFixed(9);
      lines.push(
        `[${ts()}]  TX   0x${hex(64)}  from=${addr()}  to=${addr()}  value=${value} ${token}  gas=${gas}  fee=${fee}  status=${statuses[rand(statuses.length)]}`
      );
    } else if (type === 1) {
      // Block header
      const block = (rand(9_999_999) + 1_000_000).toString();
      const txns = rand(4096) + 1;
      const epoch = rand(99_999) + 10_000;
      const size = (rand(900) + 100).toString();
      lines.push(
        `[${ts()}]  BLOCK  #${block}  hash=0x${hex(64)}  prev=0x${hex(16)}  txns=${txns}  epoch=${epoch}  size=${size}kb  proposer=${addr()}`
      );
    } else if (type === 2) {
      // Slot / validator line
      const slot = rand(99_999_999) + 10_000_000;
      const vote = (95 + Math.random() * 5).toFixed(2);
      lines.push(
        `[${ts()}]  SLOT   ${slot}  validator=${addr()}  vote=${vote}%  reward=${(Math.random() * 10).toFixed(6)} TEMPO  sig=0x${hex(128)}`
      );
    } else if (type === 3) {
      // Op / instruction line
      const op = ops[rand(ops.length)];
      const amount = (Math.random() * 100_000).toFixed(4);
      const token = tokens[rand(tokens.length)];
      lines.push(
        `[${ts()}]  OP     ${op.toUpperCase()}  caller=${addr()}  amount=${amount} ${token}  nonce=${rand(99_999)}  program=0x${hex(40)}  result=SUCCESS`
      );
    } else if (type === 4) {
      // Signature / witness
      lines.push(
        `[${ts()}]  SIG    r=0x${hex(64)}  s=0x${hex(64)}  v=${rand(2) + 27}  pubkey=0x${hex(66)}  signer=${addr()}`
      );
    } else if (type === 5) {
      // State root / merkle
      lines.push(
        `[${ts()}]  STATE  root=0x${hex(64)}  acc_hash=0x${hex(64)}  tx_hash=0x${hex(64)}  rcpt_hash=0x${hex(64)}`
      );
    } else if (type === 6) {
      // Event / log
      const events = ["Transfer", "Approval", "Staked", "Unstaked", "Swapped", "Bridged", "Minted", "Burned"];
      const ev = events[rand(events.length)];
      lines.push(
        `[${ts()}]  EVENT  ${ev}  contract=${addr()}  topic0=0x${hex(64)}  data=0x${hex(128)}`
      );
    } else if (type === 7) {
      // P2P gossip / network
      const peers = rand(512) + 1;
      lines.push(
        `[${ts()}]  GOSSIP  peers=${peers}  msg=0x${hex(32)}  ttl=${rand(64) + 1}  hop=${rand(8)}  origin=${addr()}`
      );
    } else if (type === 8) {
      // Mempool entry
      const priority = (Math.random() * 100).toFixed(2);
      lines.push(
        `[${ts()}]  MEMPOOL  0x${hex(64)}  priority=${priority}  size=${rand(2000) + 100}b  nonce=${rand(9999)}  sender=${addr()}`
      );
    } else {
      // Receipt
      const logs = rand(8);
      lines.push(
        `[${ts()}]  RCPT   tx=0x${hex(64)}  block=#${rand(9_999_999) + 1_000_000}  logs=${logs}  gasUsed=${rand(200_000) + 21_000}  status=${rand(2) === 0 ? "0x1" : "0x0"}`
      );
    }
  }

  return lines;
}

export default function DataFeed() {
  const lines = useMemo(() => generateLines(400), []);
  const doubled = [...lines, ...lines];

  return (
    <div className="landing-feed">
      <div className="landing-feed-inner">
        <div className="landing-feed-scroll">
          {doubled.map((line, i) => (
            <div key={i} className="landing-feed-line">{line}</div>
          ))}
        </div>
      </div>
      <div className="landing-feed-fade-top" />
      <div className="landing-feed-fade-bottom" />
    </div>
  );
}
