import { cn } from "@/lib/utils";

const toneMap: Record<string, string> = {
  active: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  completed: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  "in progress": "border-sky-400/25 bg-sky-400/10 text-sky-300",
  "in review": "border-violet-400/25 bg-violet-400/10 text-violet-300",
  "awaiting approval": "border-amber-400/25 bg-amber-400/10 text-amber-300",
  queued: "border-slate-400/25 bg-slate-400/10 text-slate-300",
  draft: "border-blue-400/25 bg-blue-400/10 text-blue-300",
  critical: "border-rose-400/25 bg-rose-400/10 text-rose-300",
  high: "border-orange-400/25 bg-orange-400/10 text-orange-300",
  medium: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  low: "border-slate-400/25 bg-slate-400/10 text-slate-300",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide", toneMap[value.toLowerCase()] ?? "border-white/10 bg-white/5 text-slate-300")}>{value}</span>
  );
}
