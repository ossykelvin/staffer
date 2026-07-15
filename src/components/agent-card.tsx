import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import type { AgentProfile } from "@/lib/types";

export function AgentCard({ agent }: { agent: AgentProfile }) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group rounded-2xl border border-white/8 bg-white/[0.045] p-5 transition hover:-translate-y-0.5 hover:border-blue-400/25 hover:bg-white/[0.065]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {agent.avatarPath ? (
            <span className="relative size-12 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-lg shadow-blue-950/40">
              <Image
                src={agent.avatarPath}
                alt={`${agent.name}, ${agent.jobTitle}`}
                fill
                sizes="48px"
                className="object-cover"
              />
            </span>
          ) : (
            <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/90 to-cyan-400/80 font-bold text-white shadow-lg shadow-blue-950/40">
              {agent.initials}
            </span>
          )}
          <div>
            <h3 className="font-semibold text-white group-hover:text-cyan-200">{agent.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{agent.jobTitle}</p>
          </div>
        </div>
        <StatusBadge value={agent.status} />
      </div>
      <p className="mt-5 line-clamp-3 text-sm leading-6 text-slate-400">{agent.summary}</p>
      <div className="mt-5 flex items-center justify-between border-t border-white/7 pt-4 text-xs">
        <span className="text-slate-500">Autonomy level {agent.autonomyLevel}</span>
        <span className="font-medium text-blue-300">View profile -&gt;</span>
      </div>
    </Link>
  );
}
