"use client";

import { useState, useTransition } from "react";

const transitions = [
  { key: "queued", label: "Queue" },
  { key: "blocked", label: "Block" },
  { key: "review", label: "Move to review" },
  { key: "approval", label: "Request approval" },
  { key: "completed", label: "Complete" },
] as const;

type AuditResult = {
  mode: "demo" | "live" | "skipped" | "error";
  eventType: string;
  summary: string;
  createdAt: string;
  hash?: string;
};

export function TaskTransitionPanel({
  taskId,
  onTransition,
}: {
  taskId: string;
  onTransition: (taskId: string, nextStatus: string) => Promise<AuditResult>;
}) {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
      <h2 className="font-semibold text-white">State controls</h2>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        Stage a task transition. Demo mode records a non-persistent audit result; live mode updates the task row and records an audit event.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {transitions.map((transition) => (
          <button
            key={transition.key}
            type="button"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                setResult(await onTransition(taskId, transition.key));
              });
            }}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/7 disabled:opacity-60"
          >
            {transition.label}
          </button>
        ))}
      </div>
      {result ? (
        <div className="mt-5 rounded-xl border border-cyan-400/15 bg-cyan-400/8 p-4">
          <p className="text-sm font-semibold text-white">{result.eventType}</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">{result.summary}</p>
          <p className="mt-2 font-mono text-xs text-slate-500">
            Mode: {result.mode}
            {result.hash ? ` / hash: ${result.hash}` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
