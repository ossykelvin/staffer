"use client";

import { useState, useTransition } from "react";

const decisions = [
  { key: "approved", label: "Approve", tone: "bg-emerald-500 text-emerald-950" },
  { key: "rejected", label: "Reject", tone: "bg-rose-500 text-rose-950" },
  { key: "changes", label: "Request changes", tone: "bg-amber-400 text-amber-950" },
  { key: "expired", label: "Expire", tone: "bg-slate-300 text-slate-950" },
] as const;

type AuditResult = {
  mode: "demo" | "live" | "skipped" | "error";
  eventType: string;
  summary: string;
  createdAt: string;
  hash?: string;
};

export function DemoDecisionPanel({
  approvalId,
  onDecision,
}: {
  approvalId: string;
  onDecision: (approvalId: string, decision: string) => Promise<AuditResult>;
}) {
  const [selected, setSelected] = useState<(typeof decisions)[number] | null>(null);
  const [confirmed, setConfirmed] = useState<AuditResult | null>(null);
  const [isPending, startTransition] = useTransition();

  if (confirmed) {
    return (
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Decision recorded</p>
        <h2 className="mt-3 font-semibold text-white">{confirmed.eventType}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {confirmed.summary}
        </p>
        <p className="mt-3 font-mono text-xs text-slate-500">
          Mode: {confirmed.mode}
          {confirmed.hash ? ` / hash: ${confirmed.hash}` : ""}
        </p>
        <button
          type="button"
          onClick={() => {
            setConfirmed(null);
            setSelected(null);
          }}
          className="mt-4 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/7"
        >
          Review another decision
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Decision controls</p>
      <h2 className="mt-3 font-semibold text-white">Stage a demo decision</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Live execution is blocked until tenant repositories, exact-payload checks, and append-only audit logging exist.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {decisions.map((decision) => (
          <button
            key={decision.key}
            type="button"
            onClick={() => setSelected(decision)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-90 ${decision.tone}`}
          >
            {decision.label}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/8 p-4">
          <p className="text-sm text-slate-300">
            Confirm demo decision: <span className="font-semibold text-white">{selected.label}</span>
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const result = await onDecision(approvalId, selected.key);
                  setConfirmed(result);
                });
              }}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              {isPending ? "Recording..." : "Confirm decision"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/7"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
